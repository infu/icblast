export const idlFactory = ({ IDL }) => {
  return IDL.Service({
    evalScript: IDL.Func([IDL.Text], [IDL.Text], []),
  });
};
