export const REGIONS = [
  // {
  //   id: process.env.REGION_TOKYO_ID,
  //   name: process.env.REGION_TOKYO_NAME,
  //   host: process.env.REGION_TOKYO_HOST,
  //   endpoint: process.env.REGION_TOKYO_ENDPOINT,
  //   serverPublicKey: process.env.REGION_TOKYO_SERVER_PUBLIC_KEY,
  //   baseIp: process.env.REGION_TOKYO_BASE_IP,
  //   dns: "1.1.1.1",
  // },
  // Example: Add new region
  {
    id: process.env.REGION_CA_ID,
    name: process.env.REGION_CA_NAME,
    host: process.env.REGION_CA_HOST,
    endpoint: process.env.REGION_CA_ENDPOINT,
    serverPublicKey: process.env.REGION_CA_SERVER_PUBLIC_KEY,
    baseIp: process.env.REGION_CA_BASE_IP,
    dns: "1.1.1.1",
  },
  {
    id: process.env.REGION_DE-FRANKFURT_ID,
    name: process.env.REGION_DE-FRANKFURT_HOST,
    host: process.env.REGION_DE-FRANKFURT_NAME,
    endpoint: process.env.REGION_DE-FRANKFURT_ENDPOINT,
    serverPublicKey: process.env.REGION_DE-FRANKFURT_SERVER_PUBLIC_KEY,
    baseIp: process.env.REGION_DE-FRANKFURT_BASE_IP,
    dns: "1.1.1.1",
  },
].filter(r => r.id); // Filter out undefined regions

