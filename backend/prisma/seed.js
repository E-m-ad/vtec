import bcrypt from "bcryptjs";

import prisma from "../src/config/db.js";

const hashPassword = (password) => bcrypt.hash(password, 12);

const main = async () => {
  await prisma.stockMovement.deleteMany();
  await prisma.saleItem.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.purchaseItem.deleteMany();
  await prisma.purchase.deleteMany();
  await prisma.product.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.brand.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();

  const admin = await prisma.user.create({
    data: {
      name: "Admin User",
      email: "admin@example.com",
      passwordHash: await hashPassword("admin123"),
      role: "admin",
    },
  });

  await prisma.user.create({
    data: {
      name: "Inventory Manager",
      email: "inventory@example.com",
      passwordHash: await hashPassword("inventory123"),
      role: "inventory",
    },
  });

  const categories = {};
  for (const category of [
    ["Engine Parts", "Engine components and service parts"],
    ["Brake System", "Brake pads, discs, calipers, and fluids"],
    ["Suspension", "Shock absorbers, arms, joints, and bushings"],
    ["Electrical", "Batteries, bulbs, sensors, and wiring components"],
    ["Filters", "Oil, air, fuel, and cabin filters"],
  ]) {
    const created = await prisma.category.create({
      data: {
        name: category[0],
        description: category[1],
      },
    });
    categories[created.name] = created;
  }

  const brands = {};
  for (const brand of [
    ["Bosch", "Automotive replacement parts"],
    ["Denso", "OEM and aftermarket automotive parts"],
    ["Mann Filter", "Filtration products"],
    ["NGK", "Ignition and sensor parts"],
    ["KYB", "Suspension components"],
  ]) {
    const created = await prisma.brand.create({
      data: {
        name: brand[0],
        description: brand[1],
      },
    });
    brands[created.name] = created;
  }

  const globalAutoSupply = await prisma.supplier.create({
    data: {
      name: "Global Auto Supply",
      contactName: "Ahmed Hassan",
      phone: "+201000000001",
      email: "sales@globalautosupply.example",
      address: "Industrial Zone, Cairo",
    },
  });

  const partsHub = await prisma.supplier.create({
    data: {
      name: "Parts Hub",
      contactName: "Mona Ali",
      phone: "+201000000002",
      email: "orders@partshub.example",
      address: "Downtown, Giza",
    },
  });

  await prisma.customer.createMany({
    data: [
      {
        name: "Walk-in Customer",
        phone: "+200000000000",
      },
      {
        name: "Fast Fix Garage",
        phone: "+201000000010",
        email: "service@fastfix.example",
        address: "Nasr City, Cairo",
      },
    ],
  });

  const products = [
    {
      sku: "BRK-PAD-001",
      barcode: "6221000000011",
      name: "Front Brake Pad Set",
      description: "Ceramic front brake pad set",
      categoryId: categories["Brake System"].id,
      brandId: brands.Bosch.id,
      supplierId: globalAutoSupply.id,
      purchasePrice: 850,
      salePrice: 1150,
      minStockLevel: 5,
      location: "A1-01",
      openingStock: 18,
    },
    {
      sku: "FLT-OIL-001",
      barcode: "6221000000028",
      name: "Oil Filter",
      description: "Spin-on engine oil filter",
      categoryId: categories.Filters.id,
      brandId: brands["Mann Filter"].id,
      supplierId: globalAutoSupply.id,
      purchasePrice: 120,
      salePrice: 190,
      minStockLevel: 10,
      location: "B2-03",
      openingStock: 45,
    },
    {
      sku: "ENG-SPK-001",
      barcode: "6221000000035",
      name: "Spark Plug",
      description: "Standard nickel spark plug",
      categoryId: categories["Engine Parts"].id,
      brandId: brands.NGK.id,
      supplierId: partsHub.id,
      purchasePrice: 95,
      salePrice: 150,
      minStockLevel: 20,
      location: "C1-02",
      openingStock: 80,
    },
    {
      sku: "SUS-SHOCK-001",
      barcode: "6221000000042",
      name: "Front Shock Absorber",
      description: "Gas front shock absorber",
      categoryId: categories.Suspension.id,
      brandId: brands.KYB.id,
      supplierId: partsHub.id,
      purchasePrice: 1200,
      salePrice: 1650,
      minStockLevel: 4,
      location: "D4-01",
      openingStock: 9,
    },
    {
      sku: "ELC-BAT-001",
      barcode: "6221000000059",
      name: "Car Battery 70Ah",
      description: "Maintenance-free 70Ah battery",
      categoryId: categories.Electrical.id,
      brandId: brands.Denso.id,
      supplierId: globalAutoSupply.id,
      purchasePrice: 2400,
      salePrice: 3100,
      minStockLevel: 3,
      location: "E1-01",
      openingStock: 6,
    },
  ];

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.stock_movement_context', 'enabled', true)`;

    for (const product of products) {
      const { openingStock, ...productData } = product;
      const created = await tx.product.create({
        data: {
          ...productData,
          stockQuantity: 0,
        },
      });

      await tx.product.update({
        where: { id: created.id },
        data: {
          stockQuantity: openingStock,
        },
      });

      await tx.stockMovement.create({
        data: {
          productId: created.id,
          movementType: "ADJUSTMENT",
          quantity: openingStock,
          previousQuantity: 0,
          newQuantity: openingStock,
          referenceType: "seed",
          notes: "Opening seed stock balance",
          createdBy: admin.id,
        },
      });
    }
  });
};

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
