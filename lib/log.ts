const DEBUG = Number(Deno.env.get("DEBUG"));
export const log = DEBUG ? console.log : () => {};  