const fs = require('fs');
const path = require('path');
const cryptograph = require('crypto');
const Arweave = require('arweave');

const UserAgent = 'odyssey';
const UserAgentVersion = '0.0.1';
const FileType = 'file';
const IPFSPath = 'https://arweave.net';

const currentFolder = process.cwd();

let GlobalImageType = 'png';

// Initialize Arweave client
const arweave = Arweave.init({
    host: 'arweave.net',
    port: 443,
    protocol: 'https'
});

// Function to upload an image file and its corresponding JSON file
/**
 * Function which uploads image file and json file to Arweave
 * 1. It will first upload the image file to Arweave
 * 2. Then it obtains the corresponding Arweave TX ID to update the JSON file's image field
 * 3. And uploads the json file to Arweave
 * @param tokenID - the token ID of the NFT to be uploaded
 * @returns Arweave JSON file uri
*/

export const uploadNFT = async (tokenID: any, assetsFolderName: string, walletJsonFilePath: string) => {
    
    // Check if image and JSON files exist for the given tokenID
    const imageFilePath = `${currentFolder}${assetsFolderName}/${tokenID}.${GlobalImageType}`;
    const jsonFilePath = `${currentFolder}${assetsFolderName}/${tokenID}.json`;
    
    console.log("Uploading files from " + jsonFilePath);

    if (!fs.existsSync(imageFilePath) || !fs.existsSync(jsonFilePath)) {
        throw new Error(`Error: Image or JSON file missing for tokenID ${tokenID}`);
       
    }

    // Read image file data
    const imageData = fs.readFileSync(imageFilePath);

    // Load wallet from file
    const wallet = await loadWallet(currentFolder + walletJsonFilePath);    

    // Calculate SHA-256 hash of image file
    const imageHash = calculateHash(imageFilePath);
   
    // Create transaction for image upload
    const imageTransaction = await arweave.createTransaction({ data: imageData });
    imageTransaction.addTag('Content-Type', `image/${GlobalImageType}`);
    imageTransaction.addTag('User-Agent', UserAgent);
    imageTransaction.addTag('User-Agent-Version', UserAgentVersion);
    imageTransaction.addTag('Type', FileType);
    imageTransaction.addTag('File-Hash', imageHash);

    await arweave.transactions.sign(imageTransaction, wallet);
    const imageResponse = await arweave.transactions.post(imageTransaction);
    console.log(`Uploaded Image ${tokenID}.${GlobalImageType}: ${imageTransaction.id}`);
    console.log(`Image ${tokenID} transaction response:`, imageResponse);

    // Read JSON file
    const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf-8'));
    
    // Update JSON with IPFSPath + image TXID
    jsonData.image = `${IPFSPath}/${imageTransaction.id}`;

    // Calculate SHA-256 hash of image file
    const jsonHash = calculateHash(jsonFilePath);

    // Create transaction for JSON upload
    const jsonTransaction = await arweave.createTransaction({ data: JSON.stringify(jsonData) });
    jsonTransaction.addTag('Content-Type', 'application/json');
    jsonTransaction.addTag('User-Agent', UserAgent);
    jsonTransaction.addTag('User-Agent-Version', UserAgentVersion);
    jsonTransaction.addTag('Type', FileType);
    jsonTransaction.addTag('File-Hash', jsonHash);

    await arweave.transactions.sign(jsonTransaction, wallet);
    const jsonResponse = await arweave.transactions.post(jsonTransaction);
    console.log(`Uploaded JSON ${tokenID}.json: ${jsonTransaction.id}`);
    console.log(`JSON ${tokenID} transaction response:`, jsonResponse);

    // Update JSON file in the folder
    fs.writeFileSync(jsonFilePath, JSON.stringify(jsonData, null, 2));

    // Returns Arweave JSON file uri
    console.log(`${tokenID}.json URI: ${IPFSPath}/${jsonTransaction.id}`);
    return `${IPFSPath}/${jsonTransaction.id}`;
}

/**
 * Function which loads wallet from JSON file
 * @param walletJsonFilePath - the relative file path of the Arweave wallet keypair JSON file
 * @returns wallet object - which contains the private key to be used for Arweave signing
*/
async function loadWallet(walletJsonPath: string) {
    try {              
        const walletJson = fs.readFileSync(walletJsonPath);
        const keypair = JSON.parse(walletJson);
        
        // Extract private key from Arweave keypair JSON
        const privateKey = {
            kty: keypair.kty,  // Key type (e.g., RSA)
            n: keypair.n,      // Public modulus
            e: keypair.e,      // Public exponent
            d: keypair.d,      // Private exponent
            p: keypair.p,      // First prime factor
            q: keypair.q,      // Second prime factor
            dp: keypair.dp,    // First exponent factor
            dq: keypair.dq,    // Second exponent factor
            qi: keypair.qi     // Coefficient
        };

        return privateKey;
    } catch (error) {
        console.error('Error loading wallet:', error);
        throw new Error('Failed to load wallet from JSON file.');
    }
}

/**
 * Function to calculate the SHA-256 hash of a file
 * @param filePath - the relative file path which needs to calculate its hash
 * @returns hash - which can be used to verify that the binary file has not been tampered with
*/
function calculateHash(filePath: string) {
    const fileData = fs.readFileSync(filePath);
    const hash = cryptograph.createHash('sha256');
    hash.update(fileData);
    return hash.digest('hex');
}

/**
 * Function to check if files exist in sequential order, which is 0.jpg, 1.jpg, 2.jpg, etc.
 * @param startIndex - the number to start from, which is 0
 * @param endIndex - the number to end with, which is the biggest number of the collection
 * @returns true - if files exist in sequential order
 * @returns false - if there are missing numbers
*/
function checkFilesExist(startIndex: number, endIndex: number, assetsFolderName: string) {
    for (let i = startIndex; i <= endIndex; i++) {
        if (!fs.existsSync(`${assetsFolderName}/${i}.${GlobalImageType}`) || !fs.existsSync(`${assetsFolderName}/${i}.json`)) {
            console.error(`Error: Image or JSON file missing for index ${i}`);
            return false;
        }
    }
    return true;
}

/**
 * Function to check if all image file extensions are of the same type (all jpeg, all jpg or all png)
 * It also sets the global variable GlobalImageType to the image file extension (which is either jpeg, jpg or png)
 * @returns true - if all image files are of the same file extensions
 * @returns false - if files have different extensions
*/
function checkImageTypes(assetsFolderName: string) {
    const files = fs.readdirSync(`./${assetsFolderName}`);

    const imageFiles = files.filter((file: string) => /\.(jpeg|jpg|png)$/i.test(file));

    if (imageFiles.length === 0) {
        console.log('No image files found in the folder.');
        return false;
    }

    // Check if all image files have the same type
    const firstImageType = path.extname(imageFiles[0]).toLowerCase().slice(1);
    for (let i = 1; i < imageFiles.length; i++) {
        const currentImageType = path.extname(imageFiles[i]).toLowerCase().slice(1);
        if (currentImageType !== firstImageType) {
            console.log('Image files have different types.');
            return false;
        }
    }

    // If all checks pass, update global variable with image type
    GlobalImageType = firstImageType;
    return true;
}

/**
 * Function to check if all JSON files' mandatory metadata fields are in place
 * @returns true - if all mandatory metadata fields are filled up
 * @returns false - if any of the mandatory metadata fields are not filled up
*/
function verifyMetadataFields(assetsFolderName: string) {
    try {
        const jsonFiles = fs.readdirSync(assetsFolderName).filter((file: string) => file.endsWith('.json'));
        let result = true;

        if (jsonFiles.length === 0) {
            console.log('No JSON files found in the folder.');
            result = false;
        }

        for (let i = 0; i < jsonFiles.length; i++) {
            let jsonFilename = `${i}.json`;
            //console.log(`Verifying metadata for ${jsonFilename} ...`);
            const jsonData = JSON.parse(fs.readFileSync(`${assetsFolderName}/${jsonFilename}`, 'utf-8'));
                    
            // Check if mandatory fields exist
            if (!jsonData.name || !jsonData.image || !jsonData.properties ||                                    
                !jsonData.seller_fee_basis_points || !jsonData.attributes) {                
                //!jsonData.symbol || !jsonData.description || !jsonData.collection
                console.log(`Error: Mandatory metadata field missing in ${jsonFilename}`);
                result = false;
            }

            // Check if creators array contains valid entries            
            for (const creator of jsonData.properties.creators) {
                if (!creator.address || !creator.share) {
                    console.log(`Error: Missing 'address' or 'share' field in creators array in ${jsonFilename}`);
                    result = false;
                }
            }            
            
            // Check if attributes field is an array
            if (!Array.isArray(jsonData.attributes)) {
                console.log(`Error: 'attributes' field should be an array in ${jsonFilename}`);
                result = false;
            }

            // Check if attributes array contains valid entries
            for (const attribute of jsonData.attributes) {
                if (!attribute.trait_type || !attribute.value) {
                    console.log(`Error: Missing 'trait_type' or 'value' field in attributes array in ${jsonFilename}`);
                    result = false;
                }
            }

            //console.log(`Metadata SUCCESS in ${jsonFilename}`);            
        }
        return result;

    } catch (error) {
        console.log(`Error verifying MetaDataFields: `, error);
        return false;
    }
}

/**
 * Function to validate the folder which contains all asset files (image files and json files)
 *      and the json files' metadata
 * @returns true - if all files passed validation
 * @returns false - if any files failed validation
*/
async function validateAssetFiles(assetsFolderName: string) {
    const startIndex = 0;
    let endIndex = 0;
    let totalImageFiles = 0;
    let totalJsonFiles = 0;

    // Check if all image files have the same type
    if (!checkImageTypes(assetsFolderName)) {
        console.error('Error: Different types of image files detected');
        return;
    }   

    // Find the end index by counting files
    while (fs.existsSync(`${assetsFolderName}/${endIndex}.${GlobalImageType}`)) {        
        endIndex++;
    }

    // Check if JSON files exist for the same range
    if (!checkFilesExist(startIndex, endIndex - 1, assetsFolderName)) {
        console.error('Error: JSON files missing or not matching');
        return;
    }         

    // Check if all mandatory metadata fields are in place
    if (!verifyMetadataFields(assetsFolderName)) {
        console.error('Error: JSON MetaData fields missing');
        return;
    }

    // // Upload NFTs
    // for (let i = startIndex; i < endIndex; i++) {
    //     await uploadNFT(i);
    //     totalImageFiles++;
    //     totalJsonFiles++;
    // }

    console.log(`Total Image Files in Asset Folder: ${endIndex}`);
    console.log(`Total JSON Files in Asset Folder: ${endIndex}`);
}

// Call the main function to validate asset files
//validateAssetFiles();
//uploadNFT(0);
