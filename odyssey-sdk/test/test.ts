import {
    Ed25519PrivateKey,
    Account,
    Aptos,
    EntryFunctionArgumentTypes,
    Hex,
    SimpleEntryFunctionArgumentTypes,
    SimpleTransaction,
    Network,
    AptosConfig,
  } from '@aptos-labs/ts-sdk';
  
  async function getAllResources() {
    const aptos = getNetwork('testnet');
    const account = getAccount('0x5442059efc7f328e35ca01afcda5c1e87ba4f6eec2f37071f44494e8a2a3e025');
    const odysseyResource = await aptos.getAccountOwnedObjects({
      accountAddress: account.accountAddress,
    });
    console.log(odysseyResource);
  }
  
  function getNetwork(network: string): Aptos {
    let selectedNetwork = Network.DEVNET;
    const lowercaseNetwork = network.toLowerCase();
    switch (lowercaseNetwork) {
      case 'testnet':
        selectedNetwork = Network.TESTNET;
        break;
      case 'mainnet':
        selectedNetwork = Network.MAINNET;
        break;
      case 'random':
        selectedNetwork = Network.RANDOMNET;
        break;
    }
    const APTOS_NETWORK: Network = selectedNetwork;
    const aptosConfig = new AptosConfig({ network: APTOS_NETWORK });
    const aptos = new Aptos(aptosConfig);
    return aptos;
  }
  
  function getAccount(privateKey: string): Account {
    const account: Account = Account.fromPrivateKey({
      privateKey: new Ed25519PrivateKey(privateKey),
      legacy: true, // or false, depending on your needs
    });
    return account;
  }
  
  // Call the function to fetch resources
  getAllResources().catch((error) => {
    console.error('Error:', error);
  });
  