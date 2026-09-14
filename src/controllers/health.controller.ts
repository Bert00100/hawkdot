import pool from "@/config/database";

export async function checkDatabaseConnection() {
  try {
    const result = await pool.query("SELECT NOW()");

    return {
      success: true,
      database: "PostgreSQL",
      timestamp: result.rows[0].now,
    };
  } catch (error) {
    console.error("Database connection error:", error);

    return {
      success: false,
      database: "PostgreSQL",
      error: "Unable to connect to database",
    };
  }
}