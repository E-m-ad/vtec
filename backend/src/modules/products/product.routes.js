import { Router } from "express";

import {
  create,
  getProduct,
  getProductSuppliers,
  getProducts,
  remove,
  update,
} from "./product.controller.js";

const router = Router();

router.get("/", getProducts);
router.get("/:id/suppliers", getProductSuppliers);
router.get("/:id", getProduct);
router.post("/", create);
router.put("/:id", update);
router.delete("/:id", remove);

export default router;
