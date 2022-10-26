const fs = require('fs')
const axios = require('axios')
const { ethers } = require('ethers')

// for testnet
const WMATIC_ADDRESS = '0xb685400156cF3CBE8725958DeAA61436727A30c3'
const WETH_ADDRESS = '0xd575d4047f8c667E064a4ad433D04E25187F40BB'

// for mainnet
// const WMATIC_ADDRESS = '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270'
// const WETH_ADDRESS = '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619'

// change to 'mainnet' to switch to mainnet
const BLOCKCHAIN_NETWORK_TYPE = 'testnet'

const getABI = ({ type, isTestnet = true }) => {
  if (type === 'pool') {
    return isTestnet
      ? require('@aave/core-v3/artifacts/contracts/protocol/pool/Pool.sol/Pool.json').abi
      : fs.readFileSync('./abis/lending-pool.json', 'utf-8')
  } else if (type === 'pool-address-provider') {
    return isTestnet
      ? require('@aave/core-v3/artifacts/contracts/protocol/configuration/PoolAddressesProvider.sol/PoolAddressesProvider.json').abi
      : fs.readFileSync('./abis/pool-address-provider.json', 'utf-8')
  } else if (type === 'weth-gateway') {
    return isTestnet
      ? require('@aave/core-v3/artifacts/contracts/dependencies/weth/WETH9.sol/WETH9.json').abi
      : fs.readFileSync('./abis/weth-gateway.json', 'utf-8')
  }
}

const POOL_ABI = getABI({ type: 'pool', isTestnet: BLOCKCHAIN_NETWORK_TYPE === 'testnet' })
const POOL_ADDRESS_PROVIDER_ABI = getABI({ type: 'pool-address-provider', isTestnet: BLOCKCHAIN_NETWORK_TYPE === 'testnet' })
const WETH_GATEWAY_ABI = getABI({ type: 'weth-gateway', isTestnet: BLOCKCHAIN_NETWORK_TYPE === 'testnet' })

const wmaticAddress = WMATIC_ADDRESS.toLowerCase()
const wethAddress = WETH_ADDRESS.toLowerCase()

/**
 * @ Calculates appropriate gas values for polygon on mainnet.
 *
 * See https://github.com/ethers-io/ethers.js/issues/2828
 */
const calculateGas = async (gasEstimated) => {
  const gas = {
    gasLimit: gasEstimated, // .mul(110).div(100)
    maxFeePerGas: ethers.BigNumber.from(40000000000),
    maxPriorityFeePerGas: ethers.BigNumber.from(40000000000)
  }
  try {
    const { data } = await axios({
      method: 'get',
      url: 'https://gasstation-mainnet.matic.network/v2'
    })
    gas.maxFeePerGas = ethers.utils.parseUnits(Math.ceil(data.fast.maxFee) + '', 'gwei')
    gas.maxPriorityFeePerGas = ethers.utils.parseUnits(Math.ceil(data.fast.maxPriorityFee) + '', 'gwei')
  } catch (err) {
    console.log('GAS STATION MAINNET ERROR: ', err)
  }
  return gas
}

const depositMATIC = async ({ key, amount, user }) => {
  const wallet = new ethers.Wallet(key, provider)
  const wmatic = new ethers.Contract(wmaticAddress, WETH_GATEWAY_ABI, provider)
  const wmaticContract = wmatic.connect(wallet)
  const papContractRead = new ethers.Contract(lendingPoolAddressProvider, POOL_ADDRESS_PROVIDER_ABI, provider)
  const poolAddress = await papContractRead.getPool()
  const pool = new ethers.Contract(poolAddress, POOL_ABI, provider)
  const poolContract = pool.connect(wallet)
  let txn
  let minedResult
  let supply

  if (BLOCKCHAIN_NETWORK_TYPE === 'testnet') {
    txn = await wmaticContract.deposit(
      {
        value: ethers.utils.parseUnits(amount, 'ether')
      }
    )
    console.log('TXN: ', txn)

    minedResult = await txn.wait()
    console.log('MINED RESULT: ', minedResult)

    const approval = await wmaticContract.approve(
      poolAddress,
      ethers.utils.parseUnits(amount, 'ether'),
    )
    console.log('APPROVAL: ', approval)

    supply = await poolContract.supply(
      wmaticAddress,
      ethers.utils.parseUnits(amount, 'ether'),
      user,
      0
    )
    console.log('SUPPLY: ', supply)
    return {}
  } else {
    const gasEstimated = await wmaticContract.depositETH(
      poolAddress,
      user,
      0,
      {
        value: ethers.utils.parseUnits(amount, 'ether')
      }
    )
    const gas = await calculateGas(gasEstimated)
    txn = await wmaticContract.depositETH(
      poolAddress,
      user,
      0,
      {
        value: ethers.utils.parseUnits(amount, 'ether'),
        ...gas
      }
    )
    console.log('TXN: ', txn)

    minedResult = await txn.wait()
    console.log('MINED RESULT: ', minedResult)

    supply = await poolContract.supply(
      wmaticAddress,
      ethers.utils.parseUnits(amount, 'ether'),
      user,
      0
    )
    console.log('SUPPLY: ', supply)
    return {}
  }
}

const depositETH = async ({ key, amount, user }) => {
  const wallet = new ethers.Wallet(key, provider)
  const weth = new ethers.Contract(wethAddress, WETH_GATEWAY_ABI, provider)
  const wethContract = weth.connect(wallet)
  const papContractRead = new ethers.Contract(lendingPoolAddressProvider, POOL_ADDRESS_PROVIDER_ABI, provider)
  const poolAddress = await papContractRead.getPool()
  const pool = new ethers.Contract(poolAddress, POOL_ABI, provider)
  const poolContract = pool.connect(wallet)
  let txn
  let minedResult
  let supply

  if (BLOCKCHAIN_NETWORK_TYPE === 'testnet') {
    txn = await wethContract.deposit(
      { value: ethers.utils.parseUnits(amount, 'ether') }
    )
    console.log('TXN: ', txn)

    minedResult = await txn.wait()
    console.log('MINED RESULT: ', minedResult)

    const approval = await wethContract.approve(poolAddress, ethers.utils.parseUnits(amount, 'ether'))
    console.log('APPROVAL: ', approval)

    supply = await poolContract.supply(
      wethAddress,
      ethers.utils.parseUnits(amount, 'ether'),
      user,
      0
    )
    console.log('SUPPLY: ', supply)
    return {}
  } else {
    txn = await wethContract.depositETH(
      poolAddress,
      user,
      0,
      {
        value: ethers.utils.parseUnits(amount, 'ether')
      }
    )
    console.log('TXN: ', txn)

    minedResult = await txn.wait()
    console.log('MINED RESULT: ', minedResult)

    supply = await poolContract.supply(
      wethAddress,
      ethers.utils.parseUnits(amount, 'ether'),
      user,
      0
    )
    console.log('SUPPLY: ', supply)
    return {}
  }
}

module.exports = {
  depositMATIC,
  depositETH
}
