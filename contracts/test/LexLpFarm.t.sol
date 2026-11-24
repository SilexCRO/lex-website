// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {LexLpFarm} from "../src/LexLpFarm.sol";

interface VmTest {
    function warp(uint256 timestamp) external;
    function prank(address account) external;
    function expectRevert() external;
    function expectRevert(bytes4 selector) external;
}

contract MockToken is ERC20 {
    bool private transfersBlocked;
    bool private deductOneUnit;

    constructor(string memory symbol) ERC20(symbol, symbol) {}

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }

    function setTransfersBlocked(bool blocked) external {
        transfersBlocked = blocked;
    }

    function setDeductOneUnit(bool enabled) external {
        deductOneUnit = enabled;
    }

    function _update(address from, address to, uint256 amount) internal override {
        require(!transfersBlocked, "Transfers unavailable");
        if (deductOneUnit && from != address(0) && to != address(0) && amount != 0) {
            super._update(from, address(0), 1);
            amount -= 1;
        }
        super._update(from, to, amount);
    }
}

contract LexLpFarmTest {
    VmTest private constant vm = VmTest(address(uint160(uint256(keccak256("hevm cheat code")))));

    address private constant ALICE = address(0xA11CE);
    address private constant BOB = address(0xB0B);
    uint256 private constant START = 1_000;
    uint256 private constant BUDGET = 1_000 ether;
    uint64 private constant DURATION = 100;

    MockToken private lp;
    MockToken private lex;
    LexLpFarm private farm;

    function setUp() public {
        vm.warp(START);
        lp = new MockToken("LP");
        lex = new MockToken("LEX");
        farm = new LexLpFarm(lp, lex, address(this), BUDGET, DURATION);
        lp.mint(ALICE, 100 ether);
        lp.mint(BOB, 100 ether);
        lex.mint(address(this), BUDGET);
    }

    function testOnlyFunderCanStartAndFullFundingIsAtomic() public {
        vm.expectRevert(LexLpFarm.DepositsClosed.selector);
        farm.stake(1);

        vm.expectRevert(LexLpFarm.UnauthorizedFunder.selector);
        vm.prank(ALICE);
        farm.start();

        lex.approve(address(farm), BUDGET - 1);
        vm.expectRevert();
        farm.start();
        require(farm.startTime() == 0 && lex.balanceOf(address(farm)) == 0, "Partial start");

        lex.setDeductOneUnit(true);
        lex.approve(address(farm), BUDGET);
        vm.expectRevert(LexLpFarm.InexactTransfer.selector);
        farm.start();
        require(farm.startTime() == 0 && lex.balanceOf(address(farm)) == 0, "Accepted inexact funding");

        lex.setDeductOneUnit(false);
        _start();
        require(farm.startTime() == START && farm.endTime() == START + DURATION, "Incorrect schedule");
        require(lex.balanceOf(address(farm)) == BUDGET, "Incorrect funded balance");

        vm.expectRevert(LexLpFarm.AlreadyStarted.selector);
        farm.start();
    }

    function testRewardsFollowStakeWeightAndRemainClaimableAfterEnd() public {
        _start();
        _stake(ALICE, 10 ether);

        vm.warp(START + 20);
        _stake(BOB, 30 ether);
        require(farm.earned(BOB) == 0, "Late deposit earned past rewards");

        vm.warp(START + 60);
        vm.prank(ALICE);
        farm.withdraw(10 ether);
        require(farm.earned(ALICE) == 300 ether && farm.earned(BOB) == 300 ether, "Incorrect reward split");
        require(lp.balanceOf(ALICE) == 100 ether, "Withdrawal did not return LP");

        vm.warp(START + DURATION);
        vm.expectRevert(LexLpFarm.DepositsClosed.selector);
        vm.prank(ALICE);
        farm.stake(1 ether);
        require(farm.scheduledRewardsLeft() == 0, "Emission schedule did not end");

        vm.warp(START + DURATION + 50);
        vm.prank(ALICE);
        farm.claim();
        vm.prank(BOB);
        farm.exit();
        // Splitting 400 LEX over 30 LP leaves one raw unit of index rounding dust.
        require(lex.balanceOf(ALICE) == 300 ether && lex.balanceOf(BOB) == 700 ether - 1, "Unexpected payouts");
        require(lp.balanceOf(BOB) == 100 ether && farm.totalStaked() == 0, "Exit did not return LP");
        require(lex.balanceOf(address(farm)) == 1, "Unexpected rounding dust");
    }

    function testEmptyPeriodsAndDirectLpTransfersDoNotEarnRewards() public {
        _start();
        lp.mint(address(farm), 1 ether);

        vm.warp(START + 20);
        _stake(ALICE, 5 ether);
        require(farm.earned(ALICE) == 0, "Earned before first stake");

        vm.warp(START + 30);
        vm.prank(ALICE);
        farm.exit();
        require(lex.balanceOf(ALICE) == 100 ether, "Donated LP diluted rewards");

        vm.warp(START + 60);
        _stake(BOB, 5 ether);

        vm.warp(START + DURATION);
        vm.prank(BOB);
        farm.exit();
        require(lex.balanceOf(BOB) == 400 ether, "Idle rewards assigned to next holder");
        require(lp.balanceOf(address(farm)) == 1 ether, "Donated LP paid out");
    }

    function testInexactLpTransferDoesNotCreditStake() public {
        _start();
        lp.setDeductOneUnit(true);
        vm.prank(ALICE);
        lp.approve(address(farm), 3 ether);
        vm.expectRevert(LexLpFarm.InexactTransfer.selector);
        vm.prank(ALICE);
        farm.stake(3 ether);
        require(farm.stakedBalance(ALICE) == 0 && farm.totalStaked() == 0, "Inexact deposit was credited");
        require(lp.balanceOf(ALICE) == 100 ether, "Failed deposit changed balance");
    }

    function testWithdrawalsWorkWhenRewardTransfersAreUnavailable() public {
        _start();
        _stake(ALICE, 2 ether);
        _stake(BOB, 2 ether);
        vm.warp(START + 20);
        lex.setTransfersBlocked(true);

        vm.expectRevert();
        vm.prank(ALICE);
        farm.exit();
        require(farm.stakedBalance(ALICE) == 2 ether, "Failed exit changed deposit");

        vm.prank(ALICE);
        farm.withdraw(1 ether);
        vm.prank(BOB);
        farm.emergencyWithdraw();
        require(farm.earned(ALICE) == 100 ether, "Withdrawal erased rewards");
        require(farm.earned(BOB) == 0, "Emergency rewards were not forfeited");
        require(lp.balanceOf(BOB) == 100 ether && farm.totalStaked() == 1 ether, "Wrong principal returned");
    }

    function testFractionalRewardsCarryAcrossPositionChanges() public {
        farm = new LexLpFarm(lp, lex, address(this), 5, 5);
        lex.approve(address(farm), 5);
        farm.start();
        _stake(ALICE, 2);
        _stake(BOB, 2);

        vm.warp(START + 1);
        vm.prank(ALICE);
        farm.withdraw(1);
        _stake(ALICE, 1);
        require(farm.earned(ALICE) == 0, "Paid a fractional unit");

        vm.warp(START + 2);
        vm.prank(ALICE);
        farm.claim();
        require(lex.balanceOf(ALICE) == 1, "Position change discarded a fractional unit");
    }

    function testFinalFractionalRateIsIncludedInSchedule() public {
        farm = new LexLpFarm(lp, lex, address(this), 7, 5);
        lex.approve(address(farm), 7);
        farm.start();
        _stake(ALICE, 1 ether);

        vm.warp(START + 4);
        require(farm.scheduledRewardsLeft() == 2 && farm.earned(ALICE) == 5, "Incorrect fractional emission");
        vm.warp(START + 5);
        vm.prank(ALICE);
        farm.exit();
        require(lex.balanceOf(ALICE) == 7, "Remainder lost at campaign end");
    }

    function testFuzzBudgetAndPrincipalStayConserved(uint8 join, uint8 leave, uint8 aliceWeight, uint8 bobWeight)
        public
    {
        _start();
        uint256 joinTime = uint256(join) % DURATION;
        uint256 leaveTime = joinTime + uint256(leave) % (DURATION - joinTime + 1);
        _stake(ALICE, uint256(aliceWeight) + 1);

        vm.warp(START + joinTime);
        _stake(BOB, uint256(bobWeight) + 1);

        vm.warp(START + leaveTime);
        vm.prank(ALICE);
        farm.exit();

        vm.warp(START + DURATION);
        vm.prank(BOB);
        farm.exit();
        uint256 totalPaid = lex.balanceOf(ALICE) + lex.balanceOf(BOB);
        require(totalPaid <= BUDGET && totalPaid + lex.balanceOf(address(farm)) == BUDGET, "Budget not conserved");
        require(lp.balanceOf(ALICE) == 100 ether && lp.balanceOf(BOB) == 100 ether, "LP not conserved");
        require(farm.totalStaked() == 0 && lp.balanceOf(address(farm)) == 0, "LP still held");
    }

    function _start() private {
        lex.approve(address(farm), BUDGET);
        farm.start();
    }

    function _stake(address account, uint256 amount) private {
        vm.prank(account);
        lp.approve(address(farm), amount);
        vm.prank(account);
        farm.stake(amount);
    }
}
