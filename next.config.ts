/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next 15+ mostra il warning se non elenchi gli origin durante lo sviluppo
  allowedDevOrigins: [
    "https://localhost:3000",
    "http://localhost:3000",
    "https://127.0.0.1:3000",
    "http://127.0.0.1:3000",
    "https://new-goats-stare.loca.lt", 
    "https://40e38f476f72.ngrok-free.app"
  ],
};
export default nextConfig;
