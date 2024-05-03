Odyssey literally means “a long journey full of adventures” which we believe every NFT collection should strive to become, and hence the name of our flagship product.

Project Odyssey provides a variety of capabilities and tools that streamline the implementation, administration, and engagement with NFT collections on the Aptos blockchain. 

Project Odyssey offers functionalities for creating NFTs, overseeing whitelists, uploading metadata, setting up NFT collections, and more, establishing itself as a valuable asset for the NFT community on Aptos blockchain.

# SDK Features:

- Deploy NFT collections with the option for royalties
- Update NFT collections
- View NFT collections
- Establish whitelist phase and public phase
- Setup whitelisted addresses
- Generate Merkle root for whitelists
- Generate Merkle proof for a wallet
- Upload metadata and image files to Arweave Project Odyssey Mint UI which serves as a platform for launching NFT collections.
- Ability to generate random images via layering and generate respective metadata json files for the NFT collection

To install SDK:
npm install aptivate-odyssey-sdk

Ussage example:
const { OdysseyClient } = require('aptivate-odyssey-sdk');
const odysseyClient = new OdysseyClient();

const resource_account = await odysseyClient.createOdyssey(...);

const txnHash = await odysseyClient.mintTo(address);