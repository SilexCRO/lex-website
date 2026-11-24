// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice A single, fully funded campaign for a standard ERC-20 LP and a separate reward token.
contract LexLpFarm is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant SCALE = 1e36;

    IERC20 public immutable stakingToken;
    IERC20 public immutable rewardToken;
    address public immutable fundingAccount;
    uint256 public immutable rewardBudget;
    uint64 public immutable duration;

    uint256 public startTime;
    uint256 public totalStaked;
    uint256 private emissionsCheckpoint;
    uint256 private rewardIndex;

    struct Position {
        uint256 stake;
        uint256 indexPaid;
        uint256 claimable;
        uint256 scaledRemainder;
    }

    mapping(address => Position) private positions;

    error InvalidConfiguration();
    error UnauthorizedFunder();
    error AlreadyStarted();
    error DepositsClosed();
    error InvalidAmount();
    error NothingToClaim();
    error InexactTransfer();

    event CampaignStarted(uint256 start, uint256 end, uint256 rewardBudget);
    event Staked(address indexed account, uint256 amount);
    event Withdrawn(address indexed account, uint256 amount);
    event Claimed(address indexed account, uint256 amount);
    event EmergencyWithdrawn(address indexed account, uint256 amount, uint256 forfeitedReward);

    constructor(IERC20 lp, IERC20 lex, address funder, uint256 budget, uint64 campaignDuration) {
        // Even a single raw LP unit cannot make the cumulative index overflow.
        if (
            address(lp) == address(lex) || address(lp).code.length == 0 || address(lex).code.length == 0
                || funder == address(0) || budget == 0 || budget > type(uint256).max / SCALE || campaignDuration == 0
        ) revert InvalidConfiguration();

        stakingToken = lp;
        rewardToken = lex;
        fundingAccount = funder;
        rewardBudget = budget;
        duration = campaignDuration;
    }

    /// @notice Fund and start in one transaction. Approve this farm for rewardBudget first.
    function start() external nonReentrant {
        if (msg.sender != fundingAccount) revert UnauthorizedFunder();
        if (startTime != 0) revert AlreadyStarted();

        startTime = block.timestamp;
        _receiveExact(rewardToken, rewardBudget);
        emit CampaignStarted(startTime, endTime(), rewardBudget);
    }

    function endTime() public view returns (uint256) {
        return startTime == 0 ? 0 : startTime + duration;
    }

    function scheduledRewardsLeft() external view returns (uint256) {
        return rewardBudget - _scheduledEmission();
    }

    function stakedBalance(address account) external view returns (uint256) {
        return positions[account].stake;
    }

    function earned(address account) external view returns (uint256 claimable) {
        (claimable,) = _rewardAt(positions[account], _currentIndex(_scheduledEmission()));
    }

    function stake(uint256 amount) external nonReentrant {
        if (startTime == 0 || block.timestamp >= endTime()) revert DepositsClosed();
        if (amount == 0) revert InvalidAmount();

        Position storage position = _checkpoint(msg.sender);
        position.stake += amount;
        totalStaked += amount;
        _receiveExact(stakingToken, amount);
        emit Staked(msg.sender, amount);
    }

    /// @notice Withdraw LP at any time, keeping accrued rewards available to claim.
    function withdraw(uint256 amount) external nonReentrant {
        _withdraw(_checkpoint(msg.sender), amount);
    }

    function claim() external nonReentrant {
        Position storage position = _checkpoint(msg.sender);
        if (position.claimable == 0) revert NothingToClaim();
        _payReward(position);
    }

    function exit() external nonReentrant {
        Position storage position = _checkpoint(msg.sender);
        uint256 amount = position.stake;
        if (amount == 0 && position.claimable == 0) revert NothingToClaim();
        if (amount != 0) _withdraw(position, amount);
        _payReward(position);
    }

    /// @notice Return all LP and discard both whole and fractional unclaimed rewards.
    function emergencyWithdraw() external nonReentrant {
        Position storage position = _checkpoint(msg.sender);
        uint256 amount = position.stake;
        if (amount == 0) revert InvalidAmount();

        uint256 forfeitedReward = position.claimable;
        totalStaked -= amount;
        delete positions[msg.sender];
        stakingToken.safeTransfer(msg.sender, amount);
        emit EmergencyWithdrawn(msg.sender, amount, forfeitedReward);
    }

    function _withdraw(Position storage position, uint256 amount) private {
        if (amount == 0 || amount > position.stake) revert InvalidAmount();
        position.stake -= amount;
        totalStaked -= amount;
        stakingToken.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function _payReward(Position storage position) private {
        uint256 amount = position.claimable;
        if (amount == 0) return;
        position.claimable = 0;
        rewardToken.safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }

    function _receiveExact(IERC20 token, uint256 amount) private {
        uint256 beforeTransfer = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        if (token.balanceOf(address(this)) != beforeTransfer + amount) revert InexactTransfer();
    }

    function _scheduledEmission() private view returns (uint256) {
        if (startTime == 0) return 0;
        // Calculate cumulative emissions to include the final fractional rate at the end.
        return Math.mulDiv(rewardBudget, Math.min(block.timestamp - startTime, duration), duration);
    }

    function _currentIndex(uint256 emission) private view returns (uint256) {
        if (totalStaked == 0) return rewardIndex;
        return rewardIndex + Math.mulDiv(emission - emissionsCheckpoint, SCALE, totalStaked);
    }

    function _checkpoint(address account) private returns (Position storage position) {
        uint256 emission = _scheduledEmission();
        rewardIndex = _currentIndex(emission);
        // Empty intervals are skipped, so the next deposit cannot earn past emissions.
        emissionsCheckpoint = emission;
        position = positions[account];
        (position.claimable, position.scaledRemainder) = _rewardAt(position, rewardIndex);
        position.indexPaid = rewardIndex;
    }

    function _rewardAt(Position storage position, uint256 index)
        private
        view
        returns (uint256 claimable, uint256 remainder)
    {
        uint256 indexDelta = index - position.indexPaid;
        uint256 scaledDust = position.scaledRemainder + mulmod(position.stake, indexDelta, SCALE);
        claimable = position.claimable + Math.mulDiv(position.stake, indexDelta, SCALE) + scaledDust / SCALE;
        remainder = scaledDust % SCALE;
    }
}
