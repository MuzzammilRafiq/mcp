import { LimaConnection } from "./connection/LimaConnection";

async function main() {
  const lima = new LimaConnection("myvm2"); // Use your VM name

  try {
    await lima.connect();

    // Simple command
    // const result1 = await lima.executeCommand("whoami");
    // console.log("Current user:", result1.stdout.trim());

    // // Check if VM is working
    const result2 = await lima.executeCommand("uname -a");
    console.log("System info:", result2.stdout.trim());

    // // Run Docker command if Docker is installed
  } catch (error: any) {
    console.error("Error:", error.message);
  } finally {
    lima.disconnect();
  }
}

main();
