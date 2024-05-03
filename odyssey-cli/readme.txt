# This is CLI make use of the aptivate-odyssey-sdk
# Pre-Install

Register Arweave and get the keyfile.json

Get asset files ready

# CLI

mkdir odyssey
cd odyssey

copy your keyfile.json into this folder

Mkdir assets
cd assets

copy your assets into this folder

For randomised assets refer to Randomizer
For non-randomised assets

Make sure 1 image have 1 json file(metadata) in assets folder

e.g.
1.png
1.json

Cd .. (This will go back to the root folder)
npm install -g odyssey-cli

Initializing CLI

run
odyssey Init

Answer few questions using prompt
After initialization, config.json will be created in root folder.

Odyssey CLI ussage examples

odyssey create
odyssey populate-trait-config-list
odyssey mint-to (this will prompt for receiver address)

