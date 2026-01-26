export const REGIONS = [
  {
    id: process.env.REGION_DE_ID,
    name: process.env.REGION_DE_NAME,
    host: process.env.REGION_DE_HOST,
    endpoint: process.env.REGION_DE_ENDPOINT,
    serverPublicKey: process.env.REGION_DE_SERVER_PUBLIC_KEY,
    baseIp: process.env.REGION_DE_BASE_IP,
    dns: "1.1.1.1",
  },
  {
    id: process.env.REGION_TOKYO_ID,
    name: process.env.REGION_TOKYO_NAME,
    host: process.env.REGION_TOKYO_HOST,
    endpoint: process.env.REGION_TOKYO_ENDPOINT,
    serverPublicKey: process.env.REGION_TOKYO_SERVER_PUBLIC_KEY,
    baseIp: process.env.REGION_TOKYO_BASE_IP,
    dns: "1.1.1.1",
  },
];
