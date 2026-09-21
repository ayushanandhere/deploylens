import { readdir, unlink } from "node:fs/promises";

const output = new URL("../dist/deploylens/", import.meta.url);
let names;
try {
  names = await readdir(output);
} catch (error) {
  if (error?.code === "ENOENT") process.exit(0);
  throw error;
}

const copiedSecrets = names.filter(
  (name) => name === ".dev.vars" || name.startsWith(".dev.vars.")
);
for (const name of copiedSecrets) {
  await unlink(new URL(name, output));
}
if (copiedSecrets.length) {
  console.log("Removed local preview secrets from the production build output.");
}
