import path from "path";
import dfidentity from "@dfinity/identity";
import fs from "fs";
import getRandomValues from "get-random-values";

export const MAX_IDENTITIES = 3;

const newIdentity = () => {
  const entropy = getRandomValues(new Uint8Array(32));
  const identity = dfidentity.Ed25519KeyIdentity.generate(entropy);
  return identity;
};

let fileContents = null;

export const fileIdentity = (num) => {
  if (num >= MAX_IDENTITIES) throw new Error("increase MAX identities");

  if (fileContents === null)
    try {
      fileContents = JSON.parse(fs.readFileSync(path.resolve("identity.json")));
    } catch (e) {
      console.log("Creating new identity and saving it in identity.json");
      fileContents = [];
      for (let i = 0; i < MAX_IDENTITIES; i++) {
        fileContents[i] = newIdentity();
      }

      fileContents = JSON.parse(JSON.stringify(fileContents));

      fs.writeFileSync(
        path.resolve("identity.json"),
        JSON.stringify(fileContents)
      );
    }

  return dfidentity.Ed25519KeyIdentity.fromParsedJson(fileContents[num]);
};
