import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

async function manageAdmin() {
  const args = process.argv.slice(2);
  const mode = args[0] || "create"; // create or update
  const username = args[1] || "admin";
  const password = args[2] || "admin123";

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    if (mode === "create") {
      const user = await prisma.user.upsert({
        where: { username },
        update: {
          password: hashedPassword,
          role: "admin",
        },
        create: {
          username,
          email: `${username}@example.com`,
          password: hashedPassword,
          role: "admin",
          plan: "paid", // Admins usually get paid plan benefits
        },
      });
      console.log(`✅ Admin user '${username}' created/updated successfully.`);
    } else if (mode === "update") {
      const user = await prisma.user.update({
        where: { username },
        data: {
          password: hashedPassword,
        },
      });
      console.log(`✅ Password for admin '${username}' updated successfully.`);
    } else {
      console.log("❌ Invalid mode. Use 'create' or 'update'.");
    }
  } catch (error) {
    console.error("❌ Error managing admin user:", error);
  } finally {
    await prisma.$disconnect();
  }
}

manageAdmin();
