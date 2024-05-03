const path = require('path');

module.exports = {
  mode: 'production',
  entry: './src/index.ts', // Entry point of your SDK
  output: {
    filename: 'aptivate-odyssey-sdk.js', // Name of the output file
    path: path.resolve(__dirname, 'dist'), // Output directory
    libraryTarget: 'umd', // Universal Module Definition
    globalObject: 'this' // Needed for Webpack 5
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
};
