import { IDL } from "@dfinity/candid";

export const attachEncoders = (target, interfaceFactory) => {
  const service = interfaceFactory({ IDL });

  console.dir();
  for (const [methodName, func] of service._fields) {
    target[methodName + "$"] = (...args) => [
      ...IDL.encode(func.argTypes, args),
    ];
    target["$" + methodName] = (payload) => IDL.decode(func.retTypes, payload);
  }
};