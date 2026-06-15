import LookupManager from "../components/LookupManager";

const Categories = () => {
  return (
    <LookupManager
      title="Categories"
      subtitle="Group spare parts by product family."
      endpoint="/categories"
      singular="Category"
    />
  );
};

export default Categories;
