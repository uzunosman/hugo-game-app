import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import DesignSwitcher from './components/DesignSwitcher/DesignSwitcher.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <DesignSwitcher />
  </StrictMode>,
)
