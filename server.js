import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import ExcelJS from "exceljs";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));

// Excel file path
const excelPath = path.join(__dirname, "orders.xlsx");

// Initialize or repair Excel file
async function initializeExcel() {
  let workbook = new ExcelJS.Workbook();
  let sheet;

  try {
    await fs.access(excelPath);
    await workbook.xlsx.readFile(excelPath);
    sheet = workbook.getWorksheet("Orders");
    if (!sheet) throw new Error("Worksheet missing");
    console.log("✅ Excel file exists and is valid");
  } catch {
    // Create a new file if missing or corrupted
    workbook = new ExcelJS.Workbook();
    sheet = workbook.addWorksheet("Orders");
    sheet.columns = [
      { header: "Name", key: "name", width: 20 },
      { header: "Phone", key: "phone", width: 20 },
      { header: "Perfume ID", key: "perfumeId", width: 15 },
      { header: "Perfume Name", key: "perfumeName", width: 25 },
      { header: "Quantity", key: "quantity", width: 10 },
      { header: "Delivery Address", key: "deliveryAddress", width: 30 },
      { header: "Date", key: "date", width: 25 },
    ];
    await workbook.xlsx.writeFile(excelPath);
    console.log("✅ Excel file created/recreated successfully");
  }
}
await initializeExcel();

// Email setup
let transporter = null;
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
  console.log("📧 Email transporter configured!");
} else {
  console.warn("⚠️ Email credentials missing — skipping email setup.");
}

// Root route
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "🌸 Perfume Ordering API (Dynamic Excel, Safe Columns)",
    version: "5.1.0",
  });
});

// Fetch perfumes
app.get("/perfumes", async (req, res) => {
  try {
    const perfumesPath = path.join(__dirname, "perfumes.json");
    const data = await fs.readFile(perfumesPath, "utf8");
    const perfumes = JSON.parse(data);
    res.json({ success: true, data: perfumes });
  } catch (error) {
    console.error("❌ Error loading perfumes:", error);
    res.status(500).json({ success: false, message: "Error reading perfumes.json" });
  }
});

// Save new order safely with dynamic column support
app.post("/order-perfume", async (req, res) => {
  try {
    const { name, phone, perfumeId, quantity, deliveryAddress, ...extraFields } = req.body;

    // Validation
    if (!name || !phone || !perfumeId || !quantity || !deliveryAddress) {
      return res.status(400).json({ success: false, message: "All fields are required." });
    }

    // Load perfumes
    const perfumesPath = path.join(__dirname, "perfumes.json");
    const perfumesData = await fs.readFile(perfumesPath, "utf8");
    const perfumes = JSON.parse(perfumesData);
    const selectedPerfume = perfumes.find(p => p.id.toString() === perfumeId.toString());

    if (!selectedPerfume) {
      return res.status(404).json({ success: false, message: "Perfume not found." });
    }

    // Load Excel
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(excelPath);
    let sheet = workbook.getWorksheet("Orders");
    
    // Define fixed columns only once
    const fixedColumns = [
      { header: "Name", key: "name", width: 20 },
      { header: "Phone", key: "phone", width: 20 },
      { header: "Perfume ID", key: "perfumeId", width: 15 },
      { header: "Perfume Name", key: "perfumeName", width: 25 },
      { header: "Quantity", key: "quantity", width: 10 },
      { header: "Delivery Address", key: "deliveryAddress", width: 30 },
      { header: "Date", key: "date", width: 25 },
    ];
    
    if (!sheet) {
      // Create new sheet with fixed columns
      sheet = workbook.addWorksheet("Orders");
      sheet.columns = fixedColumns;
    } else if (sheet.columns.length === 0 || sheet.columns.length !== fixedColumns.length) {
      // Ensure columns match fixed structure if missing
      sheet.columns = fixedColumns;
    }

    // Build order data - ONLY use fixed fields
    const orderData = {
      name: name,
      phone: phone,
      perfumeId: perfumeId.toString(),
      perfumeName: selectedPerfume.name,
      quantity: quantity.toString(),
      deliveryAddress: deliveryAddress,
      date: new Date().toLocaleString(),
    };

    // Prepare row values - map ONLY to fixed columns
    const rowData = [];
    fixedColumns.forEach(col => {
      const value = orderData[col.key] || "";
      rowData.push(value);
    });

    // Add row with only the fixed data
    sheet.addRow(rowData);

    // Save to file
    await workbook.xlsx.writeFile(excelPath);
    console.log(`✅ Order saved for ${name}`);

    // Send email notification
    if (transporter) {
      try {
        const emailHtml = `
          <h2>🌸 New Perfume Order Received!</h2>
          <div style="font-family: Arial, sans-serif; line-height: 1.6;">
            ${Object.entries(orderData).map(([key, value]) => 
              `<p><strong>${key}:</strong> ${value || 'N/A'}</p>`
            ).join('')}
          </div>
        `;
        
        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: process.env.EMAIL_USER,
          subject: "🌸 New Perfume Order",
          html: emailHtml,
        });
        console.log("📩 Email sent successfully!");
      } catch (emailErr) {
        console.error("❌ Email sending failed:", emailErr.message);
      }
    }

    // Return success response
    res.json({ 
      success: true, 
      message: "Order saved successfully!", 
      data: orderData 
    });

  } catch (error) {
    console.error("❌ Error saving order:", error);
    res.status(500).json({ 
      success: false, 
      message: "Error saving order.",
      error: error.message 
    });
  }
});

// Secure Excel download endpoint
app.get("/orders", async (req, res) => {
  const accessKey = req.headers["x-access-key"];
  
  // Check access key
  if (!accessKey || accessKey !== process.env.ACCESS_KEY) {
    return res.status(403).json({ success: false, message: "Access denied." });
  }

  try {
    // Check if file exists
    await fs.access(excelPath);
    
    // Send file
    res.download(excelPath, "orders.xlsx", (err) => {
      if (err) {
        console.error("❌ Error sending Excel:", err);
        if (!res.headersSent) {
          res.status(500).json({ success: false, message: "Error downloading file." });
        }
      } else {
        console.log("✅ Excel file downloaded successfully");
      }
    });
  } catch (error) {
    console.error("❌ File not found:", error);
    res.status(404).json({ success: false, message: "Excel file not found." });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Excel file: ${excelPath}`);
  console.log(`🔐 Access key required for /orders endpoint`);
});
