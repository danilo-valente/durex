const DEBUG = Number(Deno.env.get("DEBUG"));
export const log = DEBUG ? console.log : () => {};  

export const timeStart = DEBUG ? console.time : () => {};
export const timeEnd = DEBUG ? console.timeEnd : () => {};