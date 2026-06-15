import { BrowserRouter } from "react-router-dom";

import AppErrorBoundary from "./components/AppErrorBoundary";
import AppRoutes from "./routes/AppRoutes";

const App = () => {
  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AppErrorBoundary>
  );
};

export default App;
