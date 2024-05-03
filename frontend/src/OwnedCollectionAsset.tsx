// SomeComponent.tsx or another TypeScript file
import { useEffect, useState } from "react";
import { OwnedCollectionAsset } from './interface/OwnedCollectionAssets';  // Adjust the import path as needed
import { Aptos } from "@aptos-labs/ts-sdk";

interface Props {
    accountAddress: string;
    collectionAddress: string;
    aptos: Aptos;
}

const OwnedAssetsComponent: React.FC<Props> = ({ accountAddress, collectionAddress, aptos }) => {
    const [ownedAssets, setOwnedAssets] = useState<OwnedCollectionAsset[]>([]);

    const fetchOwnedAssets = async () => {
        try {
          console.log(accountAddress);
          console.log(collectionAddress);
          const ownedDigitalAsset = await aptos.getAccountOwnedTokensFromCollectionAddress({
            accountAddress: accountAddress,
            collectionAddress: collectionAddress
          });

          //console.log(ownedDigitalAsset);
          const data = await ownedDigitalAsset;
          setOwnedAssets(data.map((asset: any) => ({
              token_data_id: asset.current_token_data.token_data_id,
              token_name: asset.current_token_data.token_name,
              token_uri: asset.current_token_data.token_uri
          })));
        } catch (error) {
            console.error('Failed to fetch owned assets:', error);
        }
    };

    useEffect(() => {
       
    const interval = setInterval(() => {
        fetchOwnedAssets();
      }, 1000); // Polling every 1000ms (1 second)
    
      return () => clearInterval(interval); // Cleanup function to clear the interval
    }, [accountAddress, collectionAddress]);

      
    return (
      <div>
      {ownedAssets.map((asset, index) => (
          <div key={index}>
              <h3>{asset.token_name}</h3>
              <p>ID: {asset.token_data_id}</p>
              <a href={asset.token_uri}>View Asset</a>
          </div>
      ))}
      <br /><br />
  </div>
    );
};

export default OwnedAssetsComponent;
