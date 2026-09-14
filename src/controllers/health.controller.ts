import { getDatabaseTimestamp } from "@/models/health.model";

export async function checkDatabaseConnection() {
  try {
    const timestamp = await getDatabaseTimestamp();

    return {
      success: true,
      database: "PostgreSQL",
      timestamp,
    };
  } catch (error) {
    console.error("Database connection error:", error);

    return {
      success: false,
      database: "PostgreSQL",
      error: "Unable to connect to database",
    }
  }
  
}