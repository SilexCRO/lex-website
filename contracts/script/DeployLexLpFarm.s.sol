// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {LexLpFarm} from "../src/LexLpFarm.sol";

interface VmDeploy {
    function envAddress(string calldata name) external view returns (address);
    function envUint(string calldata name) external view returns (uint256);
    function startBroadcast() external;
    function stopBroadcast() external;
}

interface IObsidianFactory {
    function getPair(address tokenA, address tokenB) external view returns (address);
}

interface IObsidianPair is IERC20Metadata {
    function factory() external view returns (address);
    function token0() external view returns (address);
    function token1() external view returns (address);
    function getReserves() external view returns (uint112, uint112, uint32);
}

contract DeployLexLpFarm {
    VmDeploy private constant vm = VmDeploy(address(uint160(uint256(keccak256("hevm cheat code")))));

    address private constant LEX = 0x25B7449E2416e0Ef0f244f6cC34eb31C4902d9Cb;
    address private constant WCRO = 0x5C7F8A570d578ED84E63fdFA7b1eE72dEae1AE23;
    address private constant FACTORY = 0xCd2E5cC83681d62BEb066Ad0a2ec94Bf301570C9;
    address private constant LP = 0x6168431f133525be550cB03D4fEfc06e955f4997;

    function run() external returns (LexLpFarm farm) {
        require(block.chainid == 25, "Expected Cronos EVM");
        IObsidianPair pair = IObsidianPair(LP);
        require(IObsidianFactory(FACTORY).getPair(LEX, WCRO) == LP, "Unexpected factory pair");
        require(pair.factory() == FACTORY && pair.token0() == LEX && pair.token1() == WCRO, "Unexpected pool");
        (uint112 lexReserve, uint112 wcroReserve,) = pair.getReserves();
        require(lexReserve != 0 && wcroReserve != 0 && pair.totalSupply() > 0, "Empty pool");
        require(pair.decimals() == 18 && IERC20Metadata(LEX).decimals() == 18, "Unexpected decimals");

        address funder = vm.envAddress("LEX_FARM_FUNDER");
        uint256 budget = vm.envUint("LEX_FARM_BUDGET_WEI");
        uint64 duration = SafeCast.toUint64(vm.envUint("LEX_FARM_DURATION_SECONDS"));

        vm.startBroadcast();
        farm = new LexLpFarm(pair, IERC20(LEX), funder, budget, duration);
        vm.stopBroadcast();
    }
}
