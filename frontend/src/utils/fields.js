export const firstValue = (...values) => values.find((value) => value !== undefined && value !== null);

export const getProductSku = (product) => firstValue(product?.part_number, product?.sku, product?.partNumber, "");

export const getProductCost = (product) =>
  firstValue(product?.cost_price, product?.purchase_price, product?.purchasePrice, 0);

export const getProductPrice = (product) =>
  firstValue(product?.selling_price, product?.sale_price, product?.salePrice, 0);

export const getProductStock = (product) =>
  Number(firstValue(product?.stock_quantity, product?.stockQuantity, 0));

export const getProductMinStock = (product) =>
  Number(firstValue(product?.min_stock, product?.min_stock_level, product?.minStockLevel, 0));

export const getProductCategoryName = (product) =>
  firstValue(product?.category_name, product?.category?.name, "");

export const getProductBrandName = (product) => firstValue(product?.brand_name, product?.brand?.name, "");

export const getProductLocation = (product) => firstValue(product?.location, "");

export const getPartnerName = (record, relationName, fallback = "-") =>
  firstValue(record?.[`${relationName}_name`], record?.[relationName]?.name, fallback);

export const getCarLabel = (car, fallback = "-") => {
  if (!car) return fallback;

  const plateNumber = firstValue(car.plate_number, car.plateNumber, "");
  const make = firstValue(car.make, "");
  const model = firstValue(car.model, "");
  const year = firstValue(car.year, "");
  const parts = [plateNumber, [make, model, year].filter(Boolean).join(" ")].filter(Boolean);

  return parts.length ? parts.join(" - ") : fallback;
};

export const productStatus = (product) => {
  const stock = getProductStock(product);
  const minStock = getProductMinStock(product);

  if (stock === 0) return { label: "Out of Stock", className: "badge-danger" };
  if (stock <= minStock) return { label: "Low Stock", className: "badge-warning" };
  return { label: "In Stock", className: "badge-success" };
};
