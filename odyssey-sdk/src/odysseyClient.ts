import * as fs from 'fs';
import { Account, Aptos, InputGenerateTransactionPayloadData, TransactionWorkerEventsEnum, WriteSetChangeWriteResource } from '@aptos-labs/ts-sdk';
import { uploadNFT } from "./arweaveUploadFiles";
import { InputTransactionData } from '@aptos-labs/wallet-adapter-react';
import path from 'path';
import { createCanvas, loadImage } from 'canvas';
import { AptosPriceServiceConnection } from "@pythnetwork/pyth-aptos-js";
import { Price, PriceFeed } from "@pythnetwork/pyth-common-js";

const moduleAddress = "0x93680d0ecdee118d5eb30b719412b07284b9a52a48c5f1cb9a24972e32cbbb38";
const moduleAddressName = "0x93680d0ecdee118d5eb30b719412b07284b9a52a48c5f1cb9a24972e32cbbb38::odyssey_v2";
const currentFolder = process.cwd();
const randomizeFolderName = "/randomize";
const outputFilePath = "/trait_config.json";
let GlobalImageType = 'png';
let GlobalJsonType = 'json';
let globalFolderStructure: FolderStructure = {};

const PRESALE_MINT_STAGE_CATEGORY = "Presale mint stage";
const PUBLIC_SALE_MINT_STAGE_CATEGORY = "Public sale mint stage";
const PRESALE_COIN_PAYMENT_CATEGORY = "Presale mint fee";
const PUBLIC_SALE_COIN_PAYMENT_CATEGORY = "Public sale mint fee";

const APTOS_OCTA = 100000000;

interface FolderStructure {
  [folderName: string]: {
      traitValues: { name: string; probability: number }[];
  };
}

interface AddressData {
  address: string;
  qty: number;
}

export class OdysseyClient {
   constructor() {
    // Initialize your connection to Aptos blockchain
  }

  async createOdyssey(
    aptos: Aptos,
    account: Account,
    odyssey_name: string,
    collection_name: string, 
    description: string,
    cover: string,
    collection_size: number,
    royalty_numerator: number,
    royalty_denominator: number,
    presale_start_time: string,
    presale_end_time: string,
    presale_mint_fee: number,
    public_sales_start_time: string,
    public_sales_end_time: string,
    public_sales_mint_fee: number,
    public_max_mint: number,
    random_trait: boolean,
    asset_dir: string,
  ): Promise<string> {
    
    try {
      const seed = collection_name;
      console.log("\n=== Creating odyssey ===\n");
      console.log("Owner: " + account.accountAddress);
      console.log(odyssey_name);
      console.log("Connecting to APTOS network");
      
      if (random_trait){
        console.log("\nrandom trait = true");
        this.createRandomTraitConfigJSONFile(asset_dir);
      }
      
      const txn = await aptos.transaction.build.simple({
        sender: account.accountAddress,
        data: {
          function: `${moduleAddressName}::create_odyssey`,
          functionArguments: [
            odyssey_name,
            collection_name, 
            description,
            cover,
            collection_size,
            royalty_numerator,
            royalty_denominator,
            presale_start_time !== "0" ? new Date(presale_start_time).getTime() / 1000 : 0,
            presale_end_time !==  "0" ? new Date(presale_end_time).getTime() / 1000 : 0,
            presale_mint_fee,
            new Date(public_sales_start_time).getTime() / 1000,
            new Date(public_sales_end_time).getTime() / 1000,
            public_sales_mint_fee,
            public_max_mint,
            account.accountAddress.toStringWithoutPrefix(),
          ],
        },
      });

      console.log("\n=== Creating odyssey ===\n");
      
      let committedTxn = await aptos.signAndSubmitTransaction({ signer: account, transaction: txn });
      
      let getResourceAccount : any = await aptos.waitForTransaction({ transactionHash: committedTxn.hash });
      
      console.log(`Committed transaction: ${committedTxn.hash}`);
      
      // Filter the data based on the 'type' property
      const OdysseyAddress = (
        getResourceAccount.changes.find(
          (wsc: any) =>
            (wsc as WriteSetChangeWriteResource).data.type ===
            `${moduleAddressName}::Odyssey`,
        ) as WriteSetChangeWriteResource
      ).address;
      
      return OdysseyAddress;

    } catch (error: any) {
      throw new Error(`Error creating odyssey: ${error.message}`);
    }
  }

  async mintTo(
    aptos: Aptos,
    account: Account,
    to_address: string,
    resource_account: string,
    collection_name: string,
    description: string,
    asset_dir: string,
    wallet_json_file_path: string,
    random_trait: boolean
  ): Promise<string> {
    
    try {
      console.log("\n=== Minting NFT ===\n");
      let tokenURI = "";

      const collectionDetails = await aptos.getCollectionData({
        creatorAddress: resource_account,
        collectionName: collection_name,
      });
      
      const txn = await aptos.transaction.build.simple({
        sender: account.accountAddress,
        data: {
          function: `${moduleAddressName}::mint_to`,
          functionArguments: [
            resource_account,
            to_address,
            tokenURI
          ],
        },
      });
     
      let committedTxn = await aptos.signAndSubmitTransaction({ signer: account, transaction: txn });
      
      let getNFTAddress : any = await aptos.waitForTransaction({ transactionHash: committedTxn.hash });
     
      //console.log(`Committed transaction: ${committedTxn.hash}`);

      // Find the object with "type": "0x4::token::Token" in changes
      let tokenObject = getNFTAddress.changes.find((change: { data: { type: string; }; }) => {
        return change.data && change.data.type === "0x4::token::Token";
      });

      // Extract the "addr" field from the token object
      let addr = null;
      if (tokenObject) {
        addr = tokenObject.data.data.mutation_events.guid.id.addr;
      }

      console.log("Token Address:", addr);

      if (random_trait){
        await this.generateTokenRandomTraits(aptos, account, resource_account, collectionDetails.current_supply + 1);
        await this.generateImageJsonFiles(aptos, resource_account, collectionDetails.current_supply + 1, collection_name, description, asset_dir);
      }
      
      console.log("\n=== Upload assets ===\n");
      tokenURI = await uploadNFT(collectionDetails.current_supply + 1, asset_dir, wallet_json_file_path);
      if (tokenURI === undefined) {
        tokenURI = "";
      }

      this.updateTokenURI(aptos, resource_account, account, addr, tokenURI);

      return committedTxn.hash;

    } catch (error: any) {
      throw new Error(`Error minting NFT: ${error.message}`);
    }
  }

  async updateMetaDataImage(
    aptos: Aptos,
    resource_account: string,
    account: Account,
    token_no: number,
    token_address: string,
    asset_dir: string,
    wallet_json_file_path: string,
    random_trait: boolean,
    collection_name: string,
    description: string
  ): Promise<string> {
    
    try {

      if (random_trait){
        await this.generateTokenRandomTraits(aptos, account, resource_account, token_no);
        await this.generateImageJsonFiles(aptos, resource_account, token_no, collection_name, description, asset_dir);
      }

      console.log("\n=== Updating NFT metadata and image===\n");
      let tokenURI = "";
    
      console.log("\n=== Upload assets ===\n");
      tokenURI = await uploadNFT(token_no, asset_dir, wallet_json_file_path);
      
      if (tokenURI === undefined) {
        tokenURI = "";
      }

      this.updateTokenURI(aptos, resource_account, account, token_address, tokenURI);

      return tokenURI;

    } catch (error: any) {
      throw new Error(`Error updating NFT: ${error.message}`);
    }
  }


  async uploadNFT(
    id: number,
    asset_dir: string,
    wallet_json_file_path: string
    
  ): Promise<string> {
    
    try {
      console.log("\n=== Upload assets ===\n");
      let tokenURI = await uploadNFT(id, asset_dir, wallet_json_file_path);
      if (tokenURI === undefined) {
        tokenURI = "";
      }
     
      return tokenURI;

    } catch (error: any) {
      throw new Error(`Error minting NFT: ${error.message}`);
    }
  }

  async getMintToPayloads(
    account_address: string,
    resource_account: string,
    minting_qty: number,   
  ): Promise<InputTransactionData> {
    
    try {
      console.log("\n=== Retriving Minting  NFT Payload ===\n");
      
      let tokenURI="Update after minting";

      const priceFeedUpdateData  = await getOdysseyPrice();
            
      const txn: InputTransactionData = {       
        data: {
          function: `${moduleAddressName}::mint_to`,
          functionArguments: [
            resource_account,
            account_address,
            tokenURI,
            minting_qty,
            priceFeedUpdateData
          ],
        },
      };

      console.log(txn);
  
      return txn;

    } catch (error: any) {
      throw new Error(`Error minting NFT: ${error.message}`);
    }
  }

  async updatePhasesInformation(
    aptos: Aptos,
    resource_account: string,
    account: Account,
    presale_start_time: string,
    presale_end_time: string,
    public_sales_start_time: string,
    public_sales_end_time: string,
  ): Promise<string[]> {
    
    try {
      console.log("\n=== Updating Phases Information ===\n");
     
      let txHash: string[] = [];
      let txn = await aptos.transaction.build.simple({
        sender: account.accountAddress,
        data: {
          function: `${moduleAddressName}::update_odyssey_mint_stage_times`,
          functionArguments: [
            resource_account,
            PRESALE_MINT_STAGE_CATEGORY,
            presale_start_time !== "0" ? new Date(presale_start_time).getTime() / 1000 : 0,
            presale_end_time !== "0" ? new Date(presale_end_time).getTime() / 1000 : 0,
          ],
        },
      });
    
      let committedTxn = await aptos.signAndSubmitTransaction({ signer: account, transaction: txn });      
      await aptos.waitForTransaction({ transactionHash: committedTxn.hash });
      
      txHash.push(committedTxn.hash);

      txn = await aptos.transaction.build.simple({
        sender: account.accountAddress,
        data: {
          function: `${moduleAddressName}::update_odyssey_mint_stage_times`,
          functionArguments: [
            resource_account,
            PUBLIC_SALE_MINT_STAGE_CATEGORY,
            new Date(public_sales_start_time).getTime() / 1000,
            new Date(public_sales_end_time).getTime() / 1000,
          ],
        },
      });
    
      committedTxn = await aptos.signAndSubmitTransaction({ signer: account, transaction: txn });
      
      await aptos.waitForTransaction({ transactionHash: committedTxn.hash });

      txn = await aptos.transaction.build.simple({
        sender: account.accountAddress,
        data: {
          function: `${moduleAddressName}::update_odyssey_mint_stage_times`,
          functionArguments: [
            resource_account,
            PUBLIC_SALE_MINT_STAGE_CATEGORY,
            new Date(public_sales_start_time).getTime() / 1000,
            new Date(public_sales_end_time).getTime() / 1000,
          ],
        },
      });
    
      committedTxn = await aptos.signAndSubmitTransaction({ signer: account, transaction: txn });
      
      await aptos.waitForTransaction({ transactionHash: committedTxn.hash });

      txHash.push(committedTxn.hash);

      return txHash;
      
    } catch (error: any) {
      throw new Error(`Error updating phases information: ${error.message}`);
    }
  }

  async updatePaymentInformation(
    aptos: Aptos,
    resource_account: string,
    account: Account,
    presale_mint_fee: number,
    public_sales_mint_fee: number,
  ): Promise<string[]> {
    
    try {
      console.log("\n=== Updating Payment Information ===\n");
            
      let txHash: string[] = [];
      let txn = await aptos.transaction.build.simple({
        sender: account.accountAddress,
        data: {
          function: `${moduleAddressName}::update_odyssey_coin_payment`,
          functionArguments: [
            resource_account,
            PRESALE_MINT_STAGE_CATEGORY,
            presale_mint_fee,
            account.accountAddress,
            PRESALE_COIN_PAYMENT_CATEGORY
          ],
        },
      });
    
      let committedTxn = await aptos.signAndSubmitTransaction({ signer: account, transaction: txn });      
      await aptos.waitForTransaction({ transactionHash: committedTxn.hash });
      
      txHash.push(committedTxn.hash);

      txn = await aptos.transaction.build.simple({
        sender: account.accountAddress,
        data: {
          function: `${moduleAddressName}::update_odyssey_coin_payment`,
          functionArguments: [
            resource_account,
            PUBLIC_SALE_MINT_STAGE_CATEGORY,
            public_sales_mint_fee,
            account.accountAddress,
            PUBLIC_SALE_COIN_PAYMENT_CATEGORY
          ],
        },
      });
    
      committedTxn = await aptos.signAndSubmitTransaction({ signer: account, transaction: txn });
      
      await aptos.waitForTransaction({ transactionHash: committedTxn.hash });

      txHash.push(committedTxn.hash);

      return txHash;
      
    } catch (error: any) {
      throw new Error(`Error updating payment information: ${error.message}`);
    }
  }

  async updateOdyssey(
    aptos: Aptos,
    resource_account: string,
    account: Account,
    odyssey_name: string,
    collection_name: string, 
    description: string,
    cover: string,
    collection_size: number,
    
  ): Promise<string> {
    
    try {
      console.log("\n=== Updating Odyssey ===\n");

      const txn = await aptos.transaction.build.simple({
        sender: account.accountAddress,
        data: {
          function: `${moduleAddressName}::update_odyssey`,
          functionArguments: [
            resource_account,
            odyssey_name,
            collection_name, 
            description,
            cover,
            collection_size,
          ],
        },
      });
    
      let committedTxn = await aptos.signAndSubmitTransaction({ signer: account, transaction: txn });
      
      await aptos.waitForTransaction({ transactionHash: committedTxn.hash });
      //console.log(`Committed transaction: ${committedTxn.hash}`);
      
      return committedTxn.hash;

    } catch (error: any) {
      throw new Error(`Error updating Odyssey information: ${error.message}`);
    }
  }

  async updateTokenURI(
    aptos: Aptos,
    resource_account: string,
    account: Account,
    token_address: string,
    token_uri: string,
    
  ): Promise<string> {
    
    try {
      console.log("\n=== Updating Token URI ===\n");

      const txn = await aptos.transaction.build.simple({
        sender: account.accountAddress,
        data: {
          function: `${moduleAddressName}::update_token_uri`,
          functionArguments: [
            resource_account,
            token_address,
            token_uri, 
          ],
        },
      });
    
      let committedTxn = await aptos.signAndSubmitTransaction({ signer: account, transaction: txn });
      
      await aptos.waitForTransaction({ transactionHash: committedTxn.hash });
      //console.log(`Committed transaction: ${committedTxn.hash}`);
      
      return committedTxn.hash;

    } catch (error: any) {
      throw new Error(`Error updating token URI: ${error.message}`);
    }
  }


  async updateCollectionRoyalties(
    aptos: Aptos,
    resource_account: string,
    account: Account,
    collection_address: string,
    royalty_numerator: string,
    royalty_denominator: string,
    payee_address: string,
    
  ): Promise<string> {
    
    try {
      console.log("\n=== Updating Collection Royalties ===\n");
      
      const txn = await aptos.transaction.build.simple({
        sender: account.accountAddress,
        data: {
          function: `${moduleAddressName}::update_collection_royalties`,
          functionArguments: [
            resource_account,
            collection_address,
            royalty_numerator,
            royalty_denominator,
            payee_address
          ],
        },
      });
    
      let committedTxn = await aptos.signAndSubmitTransaction({ signer: account, transaction: txn });
      
      aptos.waitForTransaction({ transactionHash: committedTxn.hash });
      //console.log(`Committed transaction: ${committedTxn.hash}`);
      
      return committedTxn.hash;

    } catch (error: any) {
      throw new Error(`Error updating token URI: ${error.message}`);
    }
  }

  async getCollectionRoyalties(
    aptos: Aptos,
    resource_account: string,
    account: Account,
    collection_address: string,
    royalty_numerator: string,
    royalty_denominator: string,
    payee_address: string,
    
  ): Promise<string> {
    
    try {
      console.log("\n=== Retriving Collection Royalties ===\n");
      
      const txn = await aptos.transaction.build.simple({
        sender: account.accountAddress,
        data: {
          function: `${moduleAddressName}::update_collection_royalties`,
          functionArguments: [
            resource_account,
            collection_address,
            royalty_numerator,
            royalty_denominator,
            payee_address
          ],
        },
      });
    
      let committedTxn = await aptos.signAndSubmitTransaction({ signer: account, transaction: txn });
      
      await aptos.waitForTransaction({ transactionHash: committedTxn.hash });
      //console.log(`Committed transaction: ${committedTxn.hash}`);
      
      return committedTxn.hash;

    } catch (error: any) {
      throw new Error(`Error updating token URI: ${error.message}`);
    }
  }

  async pauseResumeOdyssey(
    aptos: Aptos,
    resource_account: string,
    account: Account,
  ) {
    
    try {
      console.log("\n=== Pause/Resume odyssey ===\n");

        const txn = await aptos.transaction.build.simple({
          sender: account.accountAddress,
          data: {
            function: `${moduleAddressName}::pause_resume_mint`,
            functionArguments: [
              resource_account,
            ],
          },
        });
      
        let committedTxn = await aptos.signAndSubmitTransaction({ signer: account, transaction: txn });
        
        await aptos.waitForTransaction({ transactionHash: committedTxn.hash });
        console.log(`Committed transaction: ${committedTxn.hash}`);
            
         
    } catch (error: any) {
      throw new Error(`Error pause/resume odyssey: ${error.message}`);
    }
  }

  async getOdyssey(aptos: Aptos, resource: string): Promise<string> {
    
    const odysseyResource = await aptos.getAccountResource({
        accountAddress:resource,
        resourceType:`${moduleAddressName}::OdysseyMintData`}
    );

    return odysseyResource;
  }

  async getStage(aptos: Aptos, resource: string): Promise<string> {
    
    const odysseyResource = await aptos.getAccountResource({
        accountAddress:resource,
        resourceType:`${moduleAddress}::mint_stage::MintStageData`}
    );

    return odysseyResource;
  }

  async getAllowListBalance(aptos: Aptos, resource: string, account_address: string): Promise<number> {
    // call view function off-chain
    const balance = await aptos.view({
      payload: {
        function: `${moduleAddressName}::allowlist_balance`,
        typeArguments: [],
        functionArguments: [
          resource,
          PRESALE_MINT_STAGE_CATEGORY,
          account_address
        ],
      },
    });

    if(balance[0])
    {
      return parseInt(balance[0].toString());  
    }
    else{
      return 0;
    }
  }

  async getPublicListBalance(aptos: Aptos, resource: string, account_address: string): Promise<number> {
    // call view function off-chain
    const balance = await aptos.view({
      payload: {
        function: `${moduleAddressName}::publiclist_balance`,
        typeArguments: [],
        functionArguments: [
          resource,
          PUBLIC_SALE_MINT_STAGE_CATEGORY,
          account_address
        ],
      },
    });

    if(balance[0])
    {
      return parseInt(balance[0].toString());  
    }
    else{
      return 0;
    }
  }


  async updateWhitelistAddresses(aptos: Aptos, account: Account, resource_account: string, whitelist_dir_file: string){
    try {
      let whitelistAddresses = [];
      let whitelistAmount = [];
      const rawData = fs.readFileSync(currentFolder + whitelist_dir_file, 'utf-8');
      const addressData: AddressData[] = JSON.parse(rawData);

      for (let i = 0; i < addressData.length; i++) {
        let address = addressData[i].address;
        let qty: number = addressData[i].qty;
        whitelistAddresses.push(address);
        whitelistAmount.push(qty);
      }
    
      const txn = await aptos.transaction.build.simple({
        sender: account.accountAddress,
        data: {
          function: `${moduleAddressName}::add_to_allowlist`,
          functionArguments: [
            resource_account,
            PRESALE_MINT_STAGE_CATEGORY,
            whitelistAddresses,
            whitelistAmount
          ],
        },
      });

      console.log("\n=== Updating allowlist ===\n");

      let committedTxn = await aptos.signAndSubmitTransaction({ signer: account, transaction: txn });
  
      await aptos.waitForTransaction({ transactionHash: committedTxn.hash });
      
      console.log(`Committed transaction: ${committedTxn.hash}`);
      
    } catch (error) {
      console.error('Error updating allowlist:', error);
      return null;
    }
  }

  // 1. Call move contract by looping json file and populate onchain trait config:
  //  - This method only needs to be called one time upon json file creation           
      
  // 2. Call move contract by passing in tokenID as parameter:
  //  - This method will loop through each trait config record
  //  - For every new trait type config record:
  //      - Generate a random number from 1 to 10,000
  //      - Based on the random number, obtain the trait value of this trait type
  //      - Write the tokenID, trait type and trait value onchain

  // 3. Call move contract to retrieve all tokenIDs with its respective trait type and trait values

  // 4. Create metadata json file based on all onchain trait type and trait value

  // 5. Create image file with all the selected layers based on all onchain trait type and trait value
    
  async populateTraitConfigList(
    aptos: Aptos,
    account: Account,
    resourceAccount: string,
    assetsFolderName: string
  ): Promise<string> {
    
    const folderPath = currentFolder + assetsFolderName + randomizeFolderName;

    try {
      console.log("\n=== Populating Trait Config List ===\n");      
      const jsonData = fs.readFileSync(folderPath + outputFilePath, 'utf-8');
      const traitsConfigList: FolderStructure = JSON.parse(jsonData);

      let total = countTraits(traitsConfigList);
      let current = 0;

      for (const traitType in traitsConfigList) {        
        let traitValues = traitsConfigList[traitType].traitValues;
        for (const traitValue of traitValues) {
          //console.log("Trait Type: " + traitType + ", Trait Value: " + traitValue.name + ", Probability: " + traitValue.probability);

          let txn = await aptos.transaction.build.simple({
            sender: account.accountAddress,
            data: {
              function: `${moduleAddressName}::populateTraitConfig`,
              functionArguments: [
                resourceAccount,
                traitType,
                traitValue.name,
                Math.round(traitValue.probability * 100)  //to change probability e.g. 33.33% to 3333
              ],
            },
          });
         
          let committedTxn = await aptos.signAndSubmitTransaction({ signer: account, transaction: txn });
          current++;
          await aptos.waitForTransaction({ transactionHash: committedTxn.hash });
          console.log(`${current}/${total}`);                    
        }
      }           
      
      return "";
      
    } catch (error: any) {
      throw new Error(`Error populating Trait Config List: ${error.message}`);
    }
  }

  async getTraitConfigList(aptos: Aptos, resource: string): Promise<string> {
    
    const traitConfigListResource = await aptos.getAccountResource(
      {
        accountAddress:resource,
        resourceType:`${moduleAddressName}::TraitsConfigList`}
    );

    return traitConfigListResource;
  }

  async generateTokenRandomTraits(
    aptos: Aptos,
    account: Account,
    resourceAccount: string,
    tokenID: number
  ): Promise<string> {
    
    try {
      console.log(`\n=== Generating Token Random Traits for TokenID ${tokenID} ===\n`);            
      
      let txn = await aptos.transaction.build.simple({
        sender: account.accountAddress,
        data: {
          function: `${moduleAddressName}::generateTokenRandomTraits`,
          functionArguments: [
            resourceAccount,
            tokenID
          ],
        },
      });
      
      let committedTxn = await aptos.signAndSubmitTransaction({ signer: account, transaction: txn });
      
      let getResourceAccount : any = await aptos.waitForTransaction({ transactionHash: committedTxn.hash });
      console.log(`Committed transaction: ${committedTxn.hash}`);                                  

      return committedTxn.hash;
      
    } catch (error: any) {
      throw new Error(`Error Generating Token Random Traits: ${error.message}`);
    }
  }

  async getTokenTraitValues(aptos: Aptos, resource: string): Promise<string> {
    
    const tokenTraitValuesResource = await aptos.getAccountResource({
      accountAddress:resource,
      resourceType:`${moduleAddressName}::TokenTraitValueList`
    });

    return tokenTraitValuesResource;
  }

  // Create JSON file which lists out all the traits and its respective values
  // 1. Get all parameter from json config file (trait, different values of trait, probability of values)
  //    - The layering has to be sequenced with double digit order, example: 00_Background, 01_Head, etc.
  // 2. Send this parameter to a Move function, it generates a random metadata based on the input and 
  //    returns the random NFT metadata
  // 3. Write this return value to the metadata json file (ID = current_supply + 1)
  // 4. Generate image by layering the image based on metadata json file (ID = current_supply + 1)

  async generateImageJsonFiles(aptos: Aptos, resource: string, toMintTokenID: number, collection_name: string, description: string, assetsFolderName: string): Promise<string> {
    
    // Retrieve all tokenIDs with its respective traits and trait values onchain
    const tokenTraitValuesResource = await aptos.getAccountResource({
      accountAddress:resource,
      resourceType:`${moduleAddressName}::TokenTraitValueList`
    });
    
    // Create array from onchain data
    
    // Parse the JSON
    const tokenTraitValues: { tokenID: number; traitType: string; traitValue: string }[] = tokenTraitValuesResource.tokenTraitValues;    

    // Convert to array of arrays
    const tokenTraitValuesList: [number, string, string][] = tokenTraitValues.map(({ tokenID, traitType, traitValue }) => [tokenID, traitType, traitValue]);
    //const allTokenIDs = tokenTraitValues.map(({ tokenID }) => tokenID);   
    //console.log(tokenDetails);
    //console.log(tokenDetails[0][0]);

    // Create a Set of distinct tokenIDs
    //const distinctTokenIDs = new Set(allTokenIDs);

    //  1. Create respective tokenID's image file based on sequence if file do not exist
    if (!fileExists(toMintTokenID + "." + GlobalImageType)) {
      await createLayeredImage(tokenTraitValuesList.filter(([tokenID]) => tokenID == toMintTokenID), assetsFolderName);
      console.log(`Image file created for TokenID: ${toMintTokenID}`);
    }
    
    //  2. Create respective tokenID's metadata json file if file do not exist
    if (!fileExists(toMintTokenID + "." + GlobalJsonType)) {
      await createMetadataJSON(tokenTraitValuesList.filter(([tokenID]) => tokenID == toMintTokenID), collection_name, description, assetsFolderName);
      console.log(`JSON file created for TokenID: ${toMintTokenID}`);
    }      

    return "";
  }

  // Create JSON config file output.json which lists out all the traits and its respective values
  // 1. It goes through all the folders in the assets/randomize to retrieve all the trait types and respective trait values
  // 2. It assigns an equal probability to each trait value
  // 3. Creator can manually update each probability in trait_config.json
  // 4. Creator needs to ensure all the trait values for each trait type adds up to 100 probability
  // 5. Creator needs to ensure probability field has max 2 decimal places
  async createRandomTraitConfigJSONFile(asset_dir: string): Promise<string> {

    const folderPath = currentFolder + asset_dir + randomizeFolderName;
    console.log("\nCreating random trait config JSON file: " + folderPath);   

    // Delete trait_config.json file before every run else will run into error
    try {
      fs.unlinkSync(folderPath + outputFilePath);
    } catch (err: any) {
        console.log('Error deleting file:', err.message);
    }
    
    globalFolderStructure = traverseFolder(folderPath);
    globalFolderStructure = distributeProbabilitiesEvenly(globalFolderStructure);
    let jsonContent = JSON.stringify(globalFolderStructure, null, 2);
    
    fs.writeFileSync(folderPath + outputFilePath, jsonContent);

    return "";
  }    
}

// Function to count the total number of traits
function countTraits(json: any): number {
  let totalCount = 0;

  // Iterate over each property in the JSON object
  for (const key in json) {
    if (json.hasOwnProperty(key)) {
      const traitValues = json[key]?.traitValues;
      if (traitValues && Array.isArray(traitValues)) {
        totalCount += traitValues.length;
      }
    }
  }

  return totalCount;
}

function traverseFolder(currentPath: string): FolderStructure {

  let i = 0;
  let folderStructure: FolderStructure = {};
  let currentFolderName = currentPath;

  function traverse(currentPath: string, folderObj: FolderStructure): void {
    i++; 
    //console.log("Traversing folder/file " + i);
    let files = fs.readdirSync(currentPath);    

    files.forEach((file) => {      

      let filePath = path.join(currentPath, file);
      let stats = fs.statSync(filePath);
      //console.log("filePath: " + filePath);
      //console.log("stats: " + stats);

      if (stats.isDirectory()) {
        //console.log("Looping folder: " + file);
        
        // Check that trait type folder has an underscore which defines the layer sequence for image generation
        let underscoreIndex = file.indexOf('_');

        // Check if underscore exists, then 
        if (underscoreIndex !== -1) {
            // Remove the substring from the start of the string until the underscore character
            file = file.substring(underscoreIndex + 1);
            //console.log(file); // Output: background
        } else {
            throw new Error('Underscore not found, which is required for image layer sequencing.');
        }

        // Recursively traverse subfolders                    
        currentFolderName = file;
        //console.log("subFolderName: " + file + " , filePath: " + filePath);                            

        traverse(filePath, folderStructure);
      } else {
        //console.log("Looping file: " + file);
        // Calculate probability for files
        let fileName = path.basename(filePath);
        //console.log("fileName: " + fileName + " , filePath: " + filePath);

        let siblingFiles = fs.readdirSync(currentPath);
        //console.log("siblingFiles: " + siblingFiles);

        let probability = 0;  //probability is set to 0 first, distributeProbabilitiesEvenly() to do it at the end
        //console.log("probability: " + probability);

        //console.log("Adding to folderObj: filePath = " + filePath);
        if (folderObj[currentFolderName]) {
          // If the key exists, push the record into the array
          folderStructure[currentFolderName].traitValues.push({ name: fileName, probability: probability });
        } else {
          // If the key doesn't exist, create the key and initialize it with an array containing the record
          folderStructure[currentFolderName] = { traitValues: [ {name: fileName, probability: probability} ] };
        }

        //console.log("Added to folderObj: filePath = " + filePath);
      }
    });
  }

  traverse(currentPath, folderStructure); // Start traversal with the top-level folder
  return folderStructure;
}

// Distributes the probability equally based on the number of trait values, user is able to update the json file manually thereafter
function distributeProbabilitiesEvenly(folderStructure: FolderStructure): FolderStructure {
  // Iterate over each folder in the folderStructure
  for (const folderName in folderStructure) {
    if (folderStructure.hasOwnProperty(folderName)) {
      const traitValues = folderStructure[folderName].traitValues;
      const totalTraitValues = traitValues.length;
      const probabilityPerFile = +(100 / totalTraitValues).toFixed(2); // Ensure two decimal places

      // Distribute probabilities evenly among files in the folder
      traitValues.forEach((traitValue, index) => {
        // For the last file, adjust its probability to ensure sum is 100
        if (index === totalTraitValues - 1) {
          const remainingProbability = +(100 - (probabilityPerFile * index)).toFixed(2); // Ensure two decimal places
          traitValue.probability = remainingProbability;
        } else {
          traitValue.probability = probabilityPerFile;
        }
      });
    }
  }
  return folderStructure;
}

// check if file exists in assets folder and returns true/false
function fileExists(filename: string): boolean {
  try {
    const filePath = "./assets/" + filename;

    // Check if the file exists
    fs.accessSync(filePath, fs.constants.F_OK);
    return true;
  } catch (err) {
      // File doesn't exist or inaccessible
      return false;
  }
}

// Creates the layered image file
//  - @data is an array of [tokenID, traitType, traitValue]
//  - note that the asset folder names are named with sequence number + underscore, e.g 00_, 01_, 02_
async function createLayeredImage(data: [number, string, string][], assetsFolderName: string) {
  try {
    // Load the first image as base image
    let [tokenID, traitType, traitValue] = data[0];
    let traitFolderSequence = "01";
    let baseImage = await loadImage(`${currentFolder}/${assetsFolderName}/${randomizeFolderName}/${traitFolderSequence}_${traitType}/${traitValue}`);

    // Create canvas with the same dimensions as the base image
    let canvas = createCanvas(baseImage.width, baseImage.height);
    let ctx = canvas.getContext('2d');

    // Draw base image onto canvas
    ctx.drawImage(baseImage, 0, 0);

    // Loop through images to layer on the base image
    // console.log("DATA LENGTH: " + data.length);
    for (let i = 1; i < (data.length); i++) {
        let [tokenID, traitType, traitValue] = data[i];
        traitFolderSequence = (i + 1).toString().padStart(2, '0');
        let image = await loadImage(`${currentFolder}/${assetsFolderName}/${randomizeFolderName}/${traitFolderSequence}_${traitType}/${traitValue}`);

        // Draw image onto canvas
        ctx.drawImage(image, 0, 0);
    }

    // Save canvas as an image file
    const dataURL = canvas.toDataURL();
    const buffer = Buffer.from(dataURL.split(',')[1], 'base64');
    fs.writeFileSync(`${currentFolder}/${assetsFolderName}/${tokenID}.${GlobalImageType}`, buffer);

  } catch (err) {    
    console.error("Function createLayeredImage error: " + err )
  }  
}


// Creates the token's Metadata JSON file
//  - @data is an array of [tokenID, traitType, traitValue]
async function createMetadataJSON(data: [number, string, string][], collection_name: string, collection_description: string, assetsFolderName: string) {
  try {
    // Set metadata variables
    let tokenID = data[0][0];
    let name = collection_name + " #" + tokenID;
    let image = "";
    let description = collection_description;

    // Process data to generate attributes (trait type and trait value)
    // - need to massage data for traitValue because it is currently used for image layering
    // - remove file extensions, example .png
    // - replace underscores (_) with spaces ( )
    // - replace hyphens (-) with spaces ( )
    let attributes = data.map(([_, traitType, traitValue]) => ({
        trait_type: traitType.replace(/_/g, ' ').replace(/-/g, ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase()),
        value: traitValue.replace(/\.[^.]*$/, '').replace(/_/g, ' ').replace(/-/g, ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase())
    }));

    // Generate metadata object
    let metadata = {
        name: name,
        image: image,
        description: description,
        attributes: attributes
    };

    let jsonContent = JSON.stringify(metadata, null, 2);
    fs.writeFileSync(`${currentFolder}/${assetsFolderName}/${tokenID}.${GlobalJsonType}`, jsonContent);

  } catch (err) {    
    console.error("Function createMetadataJSON error: " + err )
  }
}

async function getOdysseyPrice() {
  const TESTNET_HERMES_ENDPOINT = "https://hermes-beta.pyth.network";
  // Connection
  const testnetConnection = new AptosPriceServiceConnection(
    TESTNET_HERMES_ENDPOINT
  ); // Price service client used to retrieve the offchain VAAs to update the onchain price

  // Price id : this is not an aptos account but instead an opaque identifier for each price https://pyth.network/developers/price-feed-ids/#pyth-cross-chain-testnet
  const APT_USD_TESTNET_PRICE_ID =
    "0x44a93dddd8effa54ea51076c4e851b6cbbfd938e82eb90197de38fe8876bb66e";

  const priceFeedUpdateData = await testnetConnection.getPriceFeedsUpdateData([
    APT_USD_TESTNET_PRICE_ID,
  ]);

  return priceFeedUpdateData;
};

