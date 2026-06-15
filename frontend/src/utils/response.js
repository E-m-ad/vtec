export const unwrapData = (response, fallback = []) => {
  const payload = response?.data;
  if (payload?.data !== undefined) return payload.data;
  return payload ?? fallback;
};

export const listFrom = (value) => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.permissions)) return value.permissions;
  if (Array.isArray(value?.products)) return value.products;
  if (Array.isArray(value?.categories)) return value.categories;
  if (Array.isArray(value?.brands)) return value.brands;
  if (Array.isArray(value?.suppliers)) return value.suppliers;
  if (Array.isArray(value?.customers)) return value.customers;
  if (Array.isArray(value?.purchases)) return value.purchases;
  if (Array.isArray(value?.sales)) return value.sales;
  if (Array.isArray(value?.service_jobs)) return value.service_jobs;
  if (Array.isArray(value?.movements)) return value.movements;
  if (Array.isArray(value?.stock_movements)) return value.stock_movements;
  if (Array.isArray(value?.top_products)) return value.top_products;
  if (Array.isArray(value?.low_stock_products)) return value.low_stock_products;
  if (Array.isArray(value?.data)) return value.data;
  return [];
};

export const errorMessage = (error, fallback = "Something went wrong") => {
  return (
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    fallback
  );
};
