import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Home from './pages/Home';
import AddAlgorithm from './pages/AddAlgorithm';
import Profile from './pages/Profile';
import Login from './pages/Login';
import Register from './pages/Register';
import AlgorithmDetails from './pages/AlgorithmDetails';
import Moderation from './pages/Moderation';
import ToastHost from './components/ToastHost';

// Компонент для защищенных маршрутов
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <div className="loading">Загрузка...</div>;
  }
  
  return user ? <>{children}</> : <Navigate to="/login" />;
};

// Создаем отдельный компонент для основного контента, который использует useLocation
function AppContent() {
  const [activeTab, setActiveTab] = useState('/');
  const location = useLocation();
  const { user, loading } = useAuth();

  useEffect(() => {
    setActiveTab(location.pathname);
  }, [location]);

  const tabVariants = {
    active: {
      scale: 1,
      color: "#ffffff",
      transition: { duration: 0.2 }
    },
    inactive: {
      scale: 0.95,
      color: "rgba(255, 255, 255, 0.8)",
      transition: { duration: 0.2 }
    }
  };

  const underlineVariants = {
    active: {
      width: "100%",
      opacity: 1,
      transition: { type: "spring", stiffness: 300, damping: 20 }
    },
    inactive: {
      width: "0%",
      opacity: 0,
      transition: { duration: 0.2 }
    }
  };

  const pageVariants = {
    initial: { 
      opacity: 0,
      y: 20
    },
    in: { 
      opacity: 1,
      y: 0,
      transition: { duration: 0.3, ease: "easeOut" }
    },
    out: { 
      opacity: 0,
      y: -20,
      transition: { duration: 0.2, ease: "easeIn" }
    }
  };

  // Определяем, активна ли кнопка входа/регистрации
  const isAuthPageActive = location.pathname === '/login' || location.pathname === '/register';

  // Улучшенная проверка прав модератора (такая же как в Moderation.tsx)
  const hasModerationAccess = () => {
    if (!user) return false;
    
    console.log('Checking moderation access for user:', user);
    
    const userAny = user as any;
    
    // 1. Проверяем поле role
    if (user.role === 'moderator' || user.role === 'admin') {
      console.log('Access granted by role:', user.role);
      return true;
    }
    
    // 2. Проверяем Django-specific поля
    if (userAny.is_staff || userAny.is_superuser) {
      console.log('Access granted by Django fields - is_staff:', userAny.is_staff, 'is_superuser:', userAny.is_superuser);
      return true;
    }
    
    // 3. Проверяем группы пользователя
    if (userAny.groups) {
      let groups: string[] = [];
      
      // Обрабатываем разные форматы групп
      if (Array.isArray(userAny.groups)) {
        groups = userAny.groups.map((group: any) => 
          typeof group === 'string' ? group.toLowerCase() : 
          (group.name ? group.name.toLowerCase() : '')
        );
      }
      
      const moderatorGroups = [
        'moderator', 'moderators', 'модератор', 'модераторы',
        'admin', 'administrators', 'администратор', 'администраторы'
      ];
      
      const hasModeratorGroup = groups.some((group: string) => 
        moderatorGroups.includes(group)
      );
      
      if (hasModeratorGroup) {
        console.log('Access granted by groups:', groups);
        return true;
      }
    }
    
    // 4. Временная заглушка для тестирования - разрешить доступ для определенных пользователей
    const testModerators = ['admin', 'moderator', 'testmod', 'administrator'];
    if (testModerators.includes(user.username.toLowerCase())) {
      console.log('Access granted for test user:', user.username);
      return true;
    }
    
    console.log('Access DENIED for user:', user);
    return false;
  };

  return (
    <>
      <nav className="navbar">
        <div className="nav-brand">
          <Link to="/">AlgoPlatform</Link>
        </div>
        <div className="nav-links">
          <motion.div 
            className={`nav-item ${activeTab === '/' ? 'active' : ''}`}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Link to="/" onClick={() => setActiveTab('/')}>
              <motion.span
                variants={tabVariants}
                animate={activeTab === '/' ? 'active' : 'inactive'}
              >
                Поиск
              </motion.span>
              <motion.div 
                className="nav-underline"
                variants={underlineVariants}
                animate={activeTab === '/' ? 'active' : 'inactive'}
              />
            </Link>
          </motion.div>

          {/* Показываем "Добавить алгоритм" только авторизованным пользователям */}
          {user && (
            <motion.div 
              className={`nav-item ${activeTab === '/add-algorithm' ? 'active' : ''}`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Link to="/add-algorithm" onClick={() => setActiveTab('/add-algorithm')}>
                <motion.span
                  variants={tabVariants}
                  animate={activeTab === '/add-algorithm' ? 'active' : 'inactive'}
                >
                  Добавить алгоритм
                </motion.span>
                <motion.div 
                  className="nav-underline"
                  variants={underlineVariants}
                  animate={activeTab === '/add-algorithm' ? 'active' : 'inactive'}
                />
              </Link>
            </motion.div>
          )}

          {/* Показываем "Модерация" только пользователям с правами модератора */}
          {user && hasModerationAccess() && (
            <motion.div 
              className={`nav-item ${activeTab === '/moderation' ? 'active' : ''}`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Link to="/moderation" onClick={() => setActiveTab('/moderation')}>
                <motion.span
                  variants={tabVariants}
                  animate={activeTab === '/moderation' ? 'active' : 'inactive'}
                >
                  ⚡ Модерация
                </motion.span>
                <motion.div 
                  className="nav-underline"
                  variants={underlineVariants}
                  animate={activeTab === '/moderation' ? 'active' : 'inactive'}
                />
              </Link>
            </motion.div>
          )}

          {/* Условный рендеринг для Профиля/Входа */}
          {user ? (
            <motion.div 
              className={`nav-item ${activeTab === '/profile' ? 'active' : ''}`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Link to="/profile" onClick={() => setActiveTab('/profile')}>
                <motion.span
                  variants={tabVariants}
                  animate={activeTab === '/profile' ? 'active' : 'inactive'}
                >
                  👤 {user.username}
                </motion.span>
                <motion.div 
                  className="nav-underline"
                  variants={underlineVariants}
                  animate={activeTab === '/profile' ? 'active' : 'inactive'}
                />
              </Link>
            </motion.div>
          ) : (
            <motion.div 
              className={`nav-item ${isAuthPageActive ? 'active' : ''}`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Link to="/login" onClick={() => setActiveTab('/login')}>
                <motion.span
                  variants={tabVariants}
                  animate={isAuthPageActive ? 'active' : 'inactive'}
                >
                  Войти
                </motion.span>
                <motion.div 
                  className="nav-underline"
                  variants={underlineVariants}
                  animate={isAuthPageActive ? 'active' : 'inactive'}
                />
              </Link>
            </motion.div>
          )}
        </div>
      </nav>

      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={
            <motion.div
              key="home"
              initial="initial"
              animate="in"
              exit="out"
              variants={pageVariants}
            >
              <Home />
            </motion.div>
          } />
          
          {/* Защищенные маршруты */}
          <Route path="/add-algorithm" element={
            <ProtectedRoute>
              <motion.div
                key="add-algorithm"
                initial="initial"
                animate="in"
                exit="out"
                variants={pageVariants}
              >
                <AddAlgorithm />
              </motion.div>
            </ProtectedRoute>
          } />

          <Route path="/edit-algorithm/:id" element={
            <ProtectedRoute>
              <motion.div
                key="edit-algorithm"
                initial="initial"
                animate="in"
                exit="out"
                variants={pageVariants}
              >
                <AddAlgorithm />
              </motion.div>
            </ProtectedRoute>
          } />
          
          <Route path="/profile" element={
            <ProtectedRoute>
              <motion.div
                key="profile"
                initial="initial"
                animate="in"
                exit="out"
                variants={pageVariants}
              >
                <Profile />
              </motion.div>
            </ProtectedRoute>
          } />

          <Route path="/moderation" element={
            <ProtectedRoute>
              <motion.div
                key="moderation"
                initial="initial"
                animate="in"
                exit="out"
                variants={pageVariants}
              >
                <Moderation />
              </motion.div>
            </ProtectedRoute>
          } />
          
          {/* Публичные маршруты */}
          <Route path="/login" element={
            <motion.div
              key="login"
              initial="initial"
              animate="in"
              exit="out"
              variants={pageVariants}
            >
              <Login />
            </motion.div>
          } />
          
          <Route path="/register" element={
            <motion.div
              key="register"
              initial="initial"
              animate="in"
              exit="out"
              variants={pageVariants}
            >
              <Register />
            </motion.div>
          } />
          
          <Route path="/algorithm/:id" element={
            <motion.div
              key="algorithm-details"
              initial="initial"
              animate="in"
              exit="out"
              variants={pageVariants}
            >
              <AlgorithmDetails />
            </motion.div>
          } />
        </Routes>
      </AnimatePresence>
      <ToastHost />
    </>
  );
}

// Основной компонент App теперь оборачивает в AuthProvider и Router
function App() {
  return (
    <AuthProvider>
      <Router>
        <AppContent />
      </Router>
    </AuthProvider>
  );
}

export default App;