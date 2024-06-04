#!/usr/bin/env node
import { Command } from "commander";
import fs from "fs";
import path from "path";
import {
  Ed25519PrivateKey,
  Account,
  Aptos,
  AptosConfig,
  Network,
} from "@aptos-labs/ts-sdk";
const { OdysseyClient } = require("aptivate-odyssey-sdk");
const inquirer = require("inquirer");
const program = new Command();

program.version("2.0.7");

// Initialize an empty config object
let config: any = {};
// Read the config.json file if it exists
const currentFolder = process.cwd();
const configPath = path.resolve(currentFolder, "config.json");
interface Config {
  private_key: string;
  network: string;
  random_trait: boolean;
  odyssey_name: string;
  storage: {
    arweave: {
      IPFSPath: string;
      keyfilePath: string;
    };
  };
  collection: {
    collection_name: string;
    description: string;
    cover: string;
    collection_size: number;
    royalty_numerator: number;
    royalty_denominator: number;
    presale_start_time: string;
    presale_end_time: string;
    presale_mint_fee: number;
    public_sales_start_time: string;
    public_sales_end_time: string;
    public_sales_mint_fee: number;
    public_max_mint: number;
    asset_dir: string;
    whitelist_dir_file: string;
  };
}

try {
  if (fs.existsSync(configPath)) {
    const configData = fs.readFileSync(configPath, "utf-8");
    config = JSON.parse(configData);
  }
} catch (error: any) {
  console.error("Error reading config file:", error.message);
}

const odysseyClient = new OdysseyClient();

// Initialize Odyssey to be created in APTOS
program
  .command("init")
  .description("Initialize Odyssey to be created in APTOS.")
  .action(async () => {
    try {
      const config = await promptConfig();
      writeConfigToFile(config);
      console.log("Config file created successfully: config.json");
    } catch (error: any) {
      console.error("Error initializing Odyssey:", error.message);
    }
  });

let {
  resource_account,
  private_key,
  network,
  odyssey_name,
  collection,
  random_trait,
  storage,
} = config;

if (collection === undefined) {
  collection = "";
}

if (storage === undefined) {
  storage = "";
}

let {
  collection_name,
  description,
  cover,
  collection_size,
  royalty_numerator,
  royalty_denominator,
  presale_start_time,
  presale_end_time,
  presale_mint_fee,
  public_sales_start_time,
  public_sales_end_time,
  public_sales_mint_fee,
  public_max_mint,
  whitelist_dir_file,
  asset_dir,
} = collection;

let { arweave } = storage;

if (arweave === undefined) {
  arweave = "";
}
const keyfilePath = arweave.keyfilePath;
const aptos = getNetwork(network !== undefined ? network : "testnet");
const account = getAccount(
  private_key !== undefined
    ? private_key
    : "0x0000000000000000000000000000000000000000000000000000000000000000"
);

// Command to create a odyssey
program
  .command("create")
  .description("Create a new Odyssey on APTOS")
  .action(async () => {
    try {
      const resource_account = await odysseyClient.createOdyssey(
        aptos,
        account,
        odyssey_name,
        collection_name,
        description,
        cover,
        collection_size,
        royalty_numerator,
        royalty_denominator,
        presale_start_time,
        presale_end_time,
        presale_mint_fee,
        public_sales_start_time,
        public_sales_end_time,
        public_sales_mint_fee,
        public_max_mint,
        random_trait,
        asset_dir,
        network
      );

      try {
        // Check if resource_account already exists
        if (config.hasOwnProperty("resource_account")) {
          // Update the existing resource_account
          config.resource_account = resource_account;
        } else {
          // Add resource_account to the top of the JSON object
          const updatedConfig = { resource_account, ...config };
          config = updatedConfig;
        }
        // Write the updated config back to config.json
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log("Config updated successfully.");
        console.log("Return with resource: ", resource_account);
      } catch (error: any) {
        console.error("Error updating config:", error.message);
      }
    } catch (error: any) {
      console.error("Error creating odyssey:", error.message);
    }
  });

program
  .command("mint-to")
  .description("Minting NFT to <address>")
  .action(async () => {
    try {
      // Retrieve details of the NFT collection from the blockchain
      const collectionDetails = await aptos.getCollectionData({
        creatorAddress: resource_account,
        collectionName: collection_name,
      });

      // Check if the collection is not fully minted
      if (collectionDetails.current_supply < collectionDetails.max_supply) {
        // Prompt user for the receiver address
        const to_address_prompt = await inquirer.prompt([
          {
            type: "string",
            name: "to_address",
            message: "Enter the receiver address:",
            validate: (value: string) => {
              if (!value.trim()) {
                return 'Please enter a valid address".';
              }
              return true;
            },
          },
        ]);

        // Get the validated receiver address
        const to_address = to_address_prompt.to_address.trim();

        // Mint the NFT using odysseyClient.mintTo
        const txnHash = await odysseyClient.mintTo(
          aptos,
          account,
          to_address,
          resource_account,
          collection_name,
          description,
          asset_dir,
          keyfilePath,
          random_trait,
          network
        );

        console.log("Transaction Hash: ", txnHash);
      } else {
        // Throw an error if the collection is fully minted
        console.error("Error minting NFT: Fully minted");
      }
    } catch (error: any) {
      // Catch any errors that occur during the minting process
      console.error("Error minting NFT: ", error.message);
    }
  });

program
  .command("update-odyssey")
  .description("Update Odyssey based on config.json ")
  .action(async () => {
    try {
      const odyssey = await odysseyClient.getOdyssey(aptos, resource_account);

      const txnHash = await odysseyClient.updateOdyssey(
        aptos,
        resource_account,
        account,
        odyssey.collection.inner,
        description,
        cover,
        collection_size
      );

      console.log("Transaction Hash: ", txnHash);
    } catch (error: any) {
      console.error("Error updating odyssey:", error.message);
    }
  });

program
  .command("update-phases")
  .description("Update phases information")
  .action(async () => {
    try {
      const txnHash = await odysseyClient.updatePhasesInformation(
        aptos,
        resource_account,
        account,
        presale_start_time,
        presale_end_time,
        public_sales_start_time,
        public_sales_end_time
      );
      console.log("Transaction Hash: ", txnHash);
    } catch (error: any) {
      console.error("Error updating phases information: ", error.message);
    }
  });

program
  .command("update-payment")
  .description("Update payment information")
  .action(async () => {
    try {
      const txnHash = await odysseyClient.updatePaymentInformation(
        aptos,
        resource_account,
        account,
        presale_mint_fee,
        public_sales_mint_fee,
        network
      );
      console.log("Transaction Hash: ", txnHash);
    } catch (error: any) {
      console.error("Error updating payment information: ", error.message);
    }
  });

program
  .command("update-token-uri")
  .description("Update token URI")
  .action(async () => {
    try {
      const token_address_prompt = await inquirer.prompt([
        {
          type: "string",
          name: "token_address",
          message: "Enter the token address:",
          validate: (value: string) => {
            if (!value.trim()) {
              return 'Please enter a valid address".';
            }
            return true;
          },
        },
      ]);
      const token_uri_prompt = await inquirer.prompt([
        {
          type: "string",
          name: "token_uri",
          message: "Enter the token URI:",
          validate: (value: string) => {
            if (!value.trim()) {
              return 'Please enter a valid token URI".';
            }
            return true;
          },
        },
      ]);
      // Get the validated receiver address
      const token_address = token_address_prompt.token_address.trim();
      // Get the validated receiver address
      const token_uri = token_uri_prompt.token_uri.trim();
      const txnHash = await odysseyClient.updateTokenURI(
        aptos,
        resource_account,
        account,
        token_address,
        token_uri
      );

      console.log("Transaction Hash: ", txnHash);
    } catch (error: any) {
      console.error("Error updating tokem URI:", error.message);
    }
  });

program
  .command("update-royalties")
  .description("Update collection royalties")
  .action(async () => {
    try {
      const collectionDetails = await aptos.getCollectionData({
        creatorAddress: resource_account,
        collectionName: collection_name,
      });
      const royalty_numerator_prompt = await inquirer.prompt([
        {
          type: "number",
          name: "royalty_numerator",
          message: "Enter royalty numerator:",
          validate: (value: number) => {
            if (value < 0) {
              return 'Please enter a valid numerator".';
            }
            return true;
          },
        },
      ]);
      const royalty_denominator_prompt = await inquirer.prompt([
        {
          type: "number",
          name: "royalty_denominator",
          message: "Enter royalty denominator:",
          validate: (value: number) => {
            if (value < 0) {
              return 'Please enter a valid denominator".';
            }
            return true;
          },
        },
      ]);
      const payee_address_prompt = await inquirer.prompt([
        {
          type: "string",
          name: "payee_address",
          message: "Enter the payee address:",
          validate: (value: string) => {
            if (!value.trim()) {
              return 'Please enter a valid address".';
            }
            return true;
          },
        },
      ]);
      const royalty_numerator = royalty_numerator_prompt.royalty_numerator;
      const royalty_denominator =
        royalty_denominator_prompt.royalty_denominator;
      const payee_address = payee_address_prompt.payee_address.trim();

      const txnHash = await odysseyClient.updateCollectionRoyalties(
        aptos,
        resource_account,
        account,
        collectionDetails.collection_id,
        royalty_numerator,
        royalty_denominator,
        payee_address
      );

      console.log("Transaction Hash: ", txnHash);
    } catch (error: any) {
      console.error("Error updating collection royalties:", error.message);
    }
  });

program
  .command("update-whitelist")
  .description("Update whitelist")
  .action(async () => {
    try {
      await odysseyClient.updateWhitelistAddresses(
        aptos,
        account,
        resource_account,
        whitelist_dir_file
      );
    } catch (error: any) {
      console.error("Error updating whitelist:", error.message);
    }
  });

program
  .command("upload-token-metadata-image")
  .description("Upload and update NFT metadata and image")
  .action(async () => {
    try {
      const token_address_prompt = await inquirer.prompt([
        {
          type: "string",
          name: "token_address",
          message: "Enter the token address:",
          validate: (value: string) => {
            if (!value.trim()) {
              return 'Please enter a valid address".';
            }
            return true;
          },
        },
      ]);
      const token_no_prompt = await inquirer.prompt([
        {
          type: "number",
          name: "token_no",
          message: "Enter the token no.:",
          validate: (value: number) => {
            if (value <= 0) {
              return "Please enter a valid number.";
            }
            return true;
          },
        },
      ]);

      await odysseyClient.updateMetaDataImage(
        aptos,
        resource_account,
        account,
        token_no_prompt.token_no,
        token_address_prompt.token_address,
        asset_dir,
        keyfilePath,
        random_trait,
        collection_name,
        description
      );
    } catch (error: any) {
      console.error("Error updating NFT:", error.message);
    }
  });

program
  .command("get-odyssey")
  .description("Retrieve Odyssey information")
  .action(async () => {
    try {
      const odyssey = await odysseyClient.getOdyssey(aptos, resource_account);
      console.log("odyssey: ", odyssey);
    } catch (error: any) {
      console.error("Error retrieveing odyssey:", error.message);
    }
  });

program
  .command("get-collection-details")
  .description("Retrieve collection details")
  .action(async () => {
    try {
      const collectionDetails = await aptos.getCollectionData({
        creatorAddress: resource_account,
        collectionName: collection_name,
      });
      console.log(
        `Collection details: ${JSON.stringify(collectionDetails, null, 4)}`
      );
    } catch (error: any) {
      console.error("Error retriving collection details:", error.message);
    }
  });

program
  .command("pause-resume-odyssey")
  .description("Pause/resume Odyssey minting")
  .action(async () => {
    try {
      const answers = await inquirer.prompt([
        {
          type: "confirm",
          name: "paused",
          message: "Do you want to pause Odyssey?",
          default: false,
        },
      ]);

      const paused = answers.paused;

      await odysseyClient.pauseResumeOdyssey(
        aptos,
        resource_account,
        account,
        paused
      );
      console.log("Odyssey paused status: " + (paused ? "paused" : "resumed"));
    } catch (error: any) {
      console.error("Error pausing/resuming odyssey:", error.message);
    }
  });

// command to retrieve the trait config list onchain
// program
//   .command("get-trait-config-list")
//   .description("Retrieve trait config list")
//   .action(async () => {
//     try {
//       const traitConfigList = await odysseyClient.getTraitConfigList(
//         aptos,
//         resource_account
//       );
//       console.log("Trait Config List:", traitConfigList);
//     } catch (error: any) {
//       console.error("Error retrieving Trait Config List:", error.message);
//     }
//   });

// command to retrieve all tokenID's traits and respective trait values
// program
//   .command("get-token-trait-values")
//   .description("Retrieve token trait values")
//   .action(async () => {
//     try {
//       const tokenTraitValues = await odysseyClient.getTokenTraitValues(
//         aptos,
//         resource_account
//       );
//       console.log("Token Trait Values:", tokenTraitValues);
//     } catch (error: any) {
//       console.error("Error retrieving Token Trait Values:", error.message);
//     }
//   });

// command to generate a tokenID's trait values randomly based on config list
// need to set tokenID and send to move contract as parameter
// program
//   .command("generate-token-random-traits")
//   .description("Generate token random traits")
//   .action(async () => {
//     try {
//       const token_no_prompt = await inquirer.prompt([
//         {
//           type: "number",
//           name: "token_no",
//           message: "Enter the token no.:",
//           validate: (value: number) => {
//             if (value <= 0) {
//               return "Please enter a valid number.";
//             }
//             return true;
//           },
//         },
//       ]);
//       const txnHash = await odysseyClient.generateTokenRandomTraits(
//         aptos,
//         account,
//         resource_account,
//         token_no_prompt.token_no
//       );
//       console.log("Transaction Hash: ", txnHash);
//     } catch (error: any) {
//       console.error("Error Generating Token Random Traits:", error.message);
//     }
//   });

// command to generate all image files and metadata json files
// program
//   .command("generate-all-img-json-files")
//   .description("Generate all image and metadata json files")
//   .action(async () => {
//     try {
//       const token_no_prompt = await inquirer.prompt([
//         {
//           type: "number",
//           name: "token_no",
//           message: "Enter the token no.:",
//           validate: (value: number) => {
//             if (value <= 0) {
//               return "Please enter a valid number.";
//             }
//             return true;
//           },
//         },
//       ]);
//       const tokenTraitValues = await odysseyClient.generateImageJsonFiles(
//         aptos,
//         resource_account,
//         token_no_prompt.token_no
//       );
//       console.log("Token Trait Values:", tokenTraitValues);
//     } catch (error: any) {
//       console.error(
//         "Error generating Image and Metadata Json Files:",
//         error.message
//       );
//     }
//   });

// command to populate the trait config list onchain
// program
//   .command("populate-trait-config-list")
//   .description("Populate trait config list")
//   .action(async () => {
//     try {
//       const txnHash = await odysseyClient.populateTraitConfigList(
//         aptos,
//         account,
//         resource_account,
//         asset_dir
//       );
//       //console.log('Transaction Hash: ', txnHash);
//     } catch (error: any) {
//       console.error("Error populating trait configs:", error.message);
//     }
//   });

// Command to create trait_config.json file based on folder structure
// program
//   .command("create-random-trait-config-json")
//   .description("Create random trait config json")
//   .action(async () => {
//     try {
//       let txnHash = await odysseyClient.createRandomTraitConfigJSONFile(
//         asset_dir
//       );
//       console.log("Transaction Hash: ", txnHash);
//       console.log("Successful creation of randomized trait config json file.");
//     } catch (error: any) {
//       console.error("Error creating Random Trait Config JSON File:", error);
//     }
//   });

function getNetwork(network: string): Aptos {
  let selectedNetwork = Network.DEVNET;
  const lowercaseNetwork = network.toLowerCase();
  switch (lowercaseNetwork) {
    case "testnet":
      selectedNetwork = Network.TESTNET;
      break;
    case "mainnet":
      selectedNetwork = Network.MAINNET;
      break;
    case "random":
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

async function promptConfig(): Promise<Config> {
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "private_key",
      message: "Enter private key:",
    },
    {
      type: "input",
      name: "network",
      message: "Enter network (mainnet/testnet/random):",
    },

    {
      type: "confirm",
      name: "random_trait",
      message: "Do you need to randomize traits:",
    },
    {
      type: "input",
      name: "keyfilePath",
      message:
        "Enter Arweave keyfile (e.g tHW3GofkxahZd2eDXBIo_oDIchmPmqWB7yWI3xsRfd0.json):",
    },
    {
      type: "input",
      name: "collection_name",
      message: "Enter collection name:",
    },
    {
      type: "input",
      name: "description",
      message: "Enter collection description:",
    },
    {
      type: "input",
      name: "cover",
      message: "Enter collection cover image URI:",
    },
    {
      type: "number",
      name: "collection_size",
      message: "Enter collection size:",
    },
    {
      type: "number",
      name: "royalty_numerator",
      message:
        "Enter royalty numerator (if royalty is 5%, key 5 as numerator):",
    },
    {
      type: "number",
      name: "royalty_denominator",
      message:
        "Enter royalty denominator (if royalty is 5%, key 100 as denominator):",
    },
    {
      type: "input",
      name: "presale_start_time",
      message: "Enter presale start time (e.g 2024-03-21T04:00:00Z):",
    },
    {
      type: "input",
      name: "presale_end_time",
      message: "Enter presale end time (e.g 2024-03-21T04:00:00Z):",
    },
    {
      type: "number",
      name: "presale_mint_fee",
      message:
        "Enter presale mint fee in APT (enter 0.1 if mint fee is 0.1 APT)",
    },
    {
      type: "input",
      name: "public_sales_start_time",
      message: "Enter public sales start time (e.g 2024-03-21T04:00:00Z):",
    },
    {
      type: "input",
      name: "public_sales_end_time",
      message: "Enter public sales end time (e.g 2024-03-21T04:00:00Z):",
    },
    {
      type: "number",
      name: "public_sales_mint_fee",
      message:
        "Enter public sales mint fee in APT (enter 0.1 if mint fee is 0.1 APT):",
    },
    {
      type: "number",
      name: "public_max_mint",
      message:
        "Enter max mint 1 wallet can mint in public phase (enter 0 for no limit):",
    },
  ]);

  return {
    private_key: answers.private_key,
    network: answers.network,
    random_trait: answers.random_trait,
    odyssey_name: "Minting powered by Odyssey",
    storage: {
      arweave: {
        IPFSPath: "https://arweave.net",
        keyfilePath: "/" + answers.keyfilePath,
      },
    },
    collection: {
      collection_name: answers.collection_name,
      description: answers.description,
      cover: answers.cover,
      collection_size: answers.collection_size,
      royalty_numerator: answers.royalty_numerator,
      royalty_denominator: answers.royalty_denominator,
      presale_start_time: answers.presale_start_time,
      presale_end_time: answers.presale_end_time,
      presale_mint_fee: answers.presale_mint_fee * 100000000,
      public_sales_start_time: answers.public_sales_start_time,
      public_sales_end_time: answers.public_sales_end_time,
      public_sales_mint_fee: answers.public_sales_mint_fee * 100000000,
      public_max_mint: answers.public_max_mint,
      asset_dir: "/assets",
      whitelist_dir_file: "/whitelist/allowlist.json",
    },
  };
}

function writeConfigToFile(config: Config): void {
  const data = JSON.stringify(config, null, 2);
  fs.writeFileSync("config.json", data);
}

program.parse(process.argv);
