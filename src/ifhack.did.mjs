export const idlFactory = ({ IDL }) => {
  return IDL.Service({
    __get_candid_interface_tmp_hack: IDL.Func([], [IDL.Text], ["query"]),
  });
};
export const init = ({ IDL }) => {
  return [];
};
