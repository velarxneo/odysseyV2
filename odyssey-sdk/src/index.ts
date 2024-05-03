import { OdysseyClient } from './odysseyClient';

export class OdysseySDK {
  public odysseyClient: OdysseyClient;

  constructor() {
    this.odysseyClient = new OdysseyClient();
   
  }
}

