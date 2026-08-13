import React from 'react';
import { Outlet } from 'react-router-dom';

export interface AgentPrefill {
  id: string;
  message: string;
  preferredRoute: string;
}

const Layout: React.FC = () => <Outlet />;

export default Layout;
