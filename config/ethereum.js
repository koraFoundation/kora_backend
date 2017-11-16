/**
 * Ethereum configuration
 * @type {Object}
 */

module.exports.ethereum = {

  /**
   * Ethereum provider
   * @type {String}
   */
  // provider: 'http://localhost:8545',
  // provider: 'ws://localhost:8546',

  /**
   * Network id
   */
  networkId: 4, // Rinkeby testnet
  // networkId: 42, // Kovan testnet

  gas: 4300000,
  gasPrice: 21000000000,

  /**
   * humanStandardToken
   */
  HumanStandardToken: {
    networks: {
      4: {
        address: '0xE57768e12C50C7D4134bB7a1Ca2917689719183C'
      }
    }
  },

  koraTokenExponent: 2,

  koraTokenSymbol: 'KTN',

  /**
   * KoraLend
   */
  KoraLend: {
    networks: {
      4: {
        address: '0x683ca4Eb5e3d34Cda515995598C0f719281Ce872'
      }
    }
  }
};
