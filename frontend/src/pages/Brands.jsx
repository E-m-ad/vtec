import LookupManager from "../components/LookupManager";

const Brands = () => {
  return (
    <LookupManager title="Brands" subtitle="Manage manufacturers and aftermarket brands." endpoint="/brands" singular="Brand" />
  );
};

export default Brands;
