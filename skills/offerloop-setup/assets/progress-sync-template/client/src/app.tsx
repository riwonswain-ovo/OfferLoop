import React from 'react';
import { Route, Routes } from 'react-router-dom';

// This is a temporary placeholder component from spark-framework
import { Welcome } from '@lark-apaas/client-toolkit/components/Welcome';

import Layout from './components/Layout';
import NotFound from './pages/NotFound/NotFound';

const RoutesComponent = () => {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* This Welcome component should be replaced with the actual home page content */}
        <Route index element={<Welcome />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default RoutesComponent;
