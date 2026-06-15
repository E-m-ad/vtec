import { LogIn } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import axiosClient from "../api/axiosClient";
import Button from "../components/Button";
import FormInput from "../components/FormInput";
import LanguageToggle from "../components/LanguageToggle";
import logoUrl from "../img/logo.png";
import { errorMessage, unwrapData } from "../utils/response";
import { setToken, setUser } from "../utils/storage";

const Login = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: "admin@example.com",
    password: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const updateField = (event) => {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");

    if (!form.email.trim() || !form.password) {
      setError("Email and password are required");
      return;
    }

    setLoading(true);

    try {
      const response = await axiosClient.post("/auth/login", form);
      const data = unwrapData(response, {});
      const token = data?.token || response?.data?.token;
      const user = data?.user || response?.data?.user;

      if (!token) {
        throw new Error("Login succeeded without a token");
      }

      setToken(token);
      if (user) setUser(user);
      navigate("/", { replace: true });
    } catch (err) {
      setError(errorMessage(err, "Unable to login"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <LanguageToggle className="login-language-toggle" />
      <section className="login-card">
        <div className="login-icon">
          <img src={logoUrl} alt="VTEC logo" />
        </div>
        <h1>VTEC</h1>
        <p>Sign in to manage inventory and sales.</p>

        <form className="form" onSubmit={submit}>
          <FormInput
            label="Email"
            name="email"
            value={form.email}
            onChange={updateField}
            type="email"
          />
          <FormInput
            label="Password"
            name="password"
            value={form.password}
            onChange={updateField}
            type="password"
          />
          {error ? <p className="error-text">{error}</p> : null}
          <Button type="submit" icon={LogIn} disabled={loading}>
            {loading ? "Signing in" : "Login"}
          </Button>
        </form>
      </section>
    </main>
  );
};

export default Login;
