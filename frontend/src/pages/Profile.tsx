import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../service/api';
import { ModeratedAlgorithm, AlgorithmPurchaseItem } from '../types';
import { Link, useLocation } from 'react-router-dom';
import './Profile.css';

function isRealisticEmail(email: string): boolean {
  const v = email.trim();
  if (!v) return false;
  const at = v.indexOf('@');
  if (at <= 0) return false;
  const domain = v.slice(at + 1);
  return domain.includes('.') && domain.length >= 3;
}

const moderationStatusLabel: Record<string, string> = {
  pending: 'На модерации',
  approved: 'Одобрен',
  rejected: 'Отклонён',
};

type ProfileTab = 'info' | 'my-algorithms' | 'purchased';

const Profile: React.FC = () => {
  const { user, logout, updateUser, loading: authLoading } = useAuth();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<ProfileTab>('info');
  const [userAlgorithms, setUserAlgorithms] = useState<ModeratedAlgorithm[]>([]);
  const [algorithmsLoading, setAlgorithmsLoading] = useState(false);
  const [purchases, setPurchases] = useState<AlgorithmPurchaseItem[]>([]);
  const [purchasesLoading, setPurchasesLoading] = useState(false);
  const [purchasesError, setPurchasesError] = useState('');
  const [error, setError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    username: user?.username || '',
    email: user?.email || '',
    first_name: user?.first_name || '',
    last_name: user?.last_name || ''
  });

  useEffect(() => {
    if (user) {
      setEditForm({
        username: user.username || '',
        email: user.email || '',
        first_name: user.first_name || '',
        last_name: user.last_name || ''
      });
    }
  }, [user]);

  useEffect(() => {
    const tab = (location.state as { profileTab?: ProfileTab } | null)?.profileTab;
    if (tab === 'my-algorithms' || tab === 'purchased' || tab === 'info') {
      setActiveTab(tab);
    }
  }, [location.state, location.key]);

  useEffect(() => {
    const fetchUserData = async () => {
      if (!user) return;
      
      try {
        setAlgorithmsLoading(true);
        const algorithms = await apiService.getUserAlgorithms(user.username);
        setUserAlgorithms(algorithms);
      } catch (err) {
        setError('Ошибка загрузки данных пользователя');
        console.error('Profile data fetch error:', err);
      } finally {
        setAlgorithmsLoading(false);
      }
    };

    fetchUserData();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const data = await apiService.getMyPurchases();
        setPurchases(data);
      } catch {
        /* счётчик вкладки необязателен */
      }
    })();
  }, [user]);

  useEffect(() => {
    const loadPurchases = async () => {
      if (!user || activeTab !== 'purchased') return;
      try {
        setPurchasesLoading(true);
        setPurchasesError('');
        const data = await apiService.getMyPurchases();
        setPurchases(data);
      } catch (err) {
        setPurchasesError('Не удалось загрузить покупки');
        console.error(err);
      } finally {
        setPurchasesLoading(false);
      }
    };
    loadPurchases();
  }, [user, activeTab]);

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isRealisticEmail(editForm.email)) {
      setError('Укажите корректный email вида name@example.com');
      return;
    }
    try {
      await updateUser(editForm);
      setIsEditing(false);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка обновления профиля');
      console.error('Profile update error:', err);
    }
  };

  const cancelEditing = () => {
    if (user) {
      setEditForm({
        username: user.username || '',
        email: user.email || '',
        first_name: user.first_name || '',
        last_name: user.last_name || '',
      });
    }
    setIsEditing(false);
    setError('');
  };

  const handleLogout = () => {
    logout();
    window.location.href = '/';
  };

  const rejectedAlgorithmsCount = useMemo(
    () => userAlgorithms.filter((a) => a.status === 'rejected').length,
    [userAlgorithms]
  );

  if (authLoading) {
    return (
      <div className="profile-container">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Проверка аутентификации...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="unauthorized-container">
        <div className="unauthorized-content">
          <div className="unauthorized-icon">
            <svg width="80" height="80" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 12C14.2091 12 16 10.2091 16 8C16 5.79086 14.2091 4 12 4C9.79086 4 8 5.79086 8 8C8 10.2091 9.79086 12 12 12Z" stroke="currentColor" strokeWidth="2"/>
              <path d="M12 14C8.13401 14 5 17.134 5 21H19C19 17.134 15.866 14 12 14Z" stroke="currentColor" strokeWidth="2"/>
              <path d="M20 8L18 10M18 10L16 12M18 10L20 12M18 10L16 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <h1>Доступ ограничен</h1>
          <p className="unauthorized-message">
            Для просмотра профиля необходимо авторизоваться в системе
          </p>
          <div className="unauthorized-actions">
            <Link to="/login" className="auth-btn primary">
              <span>Войти в аккаунт</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
            <Link to="/register" className="auth-btn secondary">
              <span>Создать аккаунт</span>
            </Link>
          </div>
          <div className="unauthorized-features">
            <div className="feature">
              <div className="feature-icon">✓</div>
              <span>Создавайте собственные алгоритмы</span>
            </div>
            <div className="feature">
              <div className="feature-icon">✓</div>
              <span>Сохраняйте избранные решения</span>
            </div>
            <div className="feature">
              <div className="feature-icon">✓</div>
              <span>Отслеживайте свою активность</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-container">
      <div className="profile-header">
        <h1>Профиль пользователя</h1>
        <button className="logout-btn" onClick={handleLogout}>
          Выйти
        </button>
      </div>

      {error && activeTab === 'info' && (
        <div className="error-message">{error}</div>
      )}

      <div className="profile-tabs" role="tablist" aria-label="Разделы профиля">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'info'}
          className={`profile-tab ${activeTab === 'info' ? 'active' : ''}`}
          onClick={() => setActiveTab('info')}
        >
          Профиль
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'my-algorithms'}
          className={`profile-tab profile-tab--with-badge ${activeTab === 'my-algorithms' ? 'active' : ''}`}
          onClick={() => setActiveTab('my-algorithms')}
        >
          <span className="profile-tab-inner">
            <span>Мои алгоритмы</span>
            <span className="profile-tab-muted-count">({userAlgorithms.length})</span>
            {rejectedAlgorithmsCount > 0 && (
              <span
                className="profile-tab-notify"
                title={`Отклонённых алгоритмов: ${rejectedAlgorithmsCount}`}
                aria-label={`Есть отклонённые алгоритмы: ${rejectedAlgorithmsCount}`}
              >
                {rejectedAlgorithmsCount}
              </span>
            )}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'purchased'}
          className={`profile-tab ${activeTab === 'purchased' ? 'active' : ''}`}
          onClick={() => setActiveTab('purchased')}
        >
          Купленные ({purchases.length})
        </button>
      </div>

      <div className="profile-content profile-content--tabs">
        {activeTab === 'info' && (
        <div className="profile-info-section">
          <h2>Информация профиля</h2>
          
          {!isEditing ? (
            <div className="profile-info">
              <div className="info-section">
                <label>Имя пользователя:</label>
                <span>{user.username}</span>
              </div>

              <div className="info-section">
                <label>Email:</label>
                <span>{user.email || 'Не указан'}</span>
              </div>

              <div className="info-section">
                <label>Имя:</label>
                <span>{user.first_name || 'Не указано'}</span>
              </div>

              <div className="info-section">
                <label>Фамилия:</label>
                <span>{user.last_name || 'Не указана'}</span>
              </div>

              <button 
                className="edit-btn"
                onClick={() => setIsEditing(true)}
              >
                Редактировать профиль
              </button>
            </div>
          ) : (
            <form className="edit-form" onSubmit={handleEditSubmit}>
              <div className="form-group">
                <label>Имя пользователя:</label>
                <input
                  type="text"
                  value={editForm.username}
                  onChange={(e) => setEditForm({...editForm, username: e.target.value})}
                  required
                />
              </div>

              <div className="form-group">
                <label>Email:</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({...editForm, email: e.target.value})}
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  title="Формат: имя@домен.зона"
                />
              </div>

              <div className="form-group">
                <label>Имя:</label>
                <input
                  type="text"
                  value={editForm.first_name}
                  onChange={(e) => setEditForm({...editForm, first_name: e.target.value})}
                />
              </div>

              <div className="form-group">
                <label>Фамилия:</label>
                <input
                  type="text"
                  value={editForm.last_name}
                  onChange={(e) => setEditForm({...editForm, last_name: e.target.value})}
                />
              </div>

              <div className="form-actions">
                <button type="submit" className="save-btn">
                  Сохранить
                </button>
                <button 
                  type="button" 
                  className="cancel-btn"
                  onClick={cancelEditing}
                >
                  Отмена
                </button>
              </div>
            </form>
          )}
        </div>
        )}

        {activeTab === 'my-algorithms' && (
        <div className="algorithms-section">
          <h2>Мои алгоритмы ({userAlgorithms.length})</h2>
          
          {algorithmsLoading ? (
            <div className="loading">Загрузка алгоритмов...</div>
          ) : userAlgorithms.length === 0 ? (
            <div className="no-algorithms">
              У вас пока нет созданных алгоритмов
            </div>
          ) : (
            <div className="algorithms-list">
              {userAlgorithms.map((algorithm) => (
                <div
                  key={algorithm.id}
                  className={`algorithm-card ${algorithm.status === 'rejected' ? 'algorithm-card--rejected' : ''}`}
                >
                  <h3>{algorithm.title}</h3>
                  <p>{algorithm.description}</p>
                  <div className="algorithm-meta" role="list">
                    <span
                      role="listitem"
                      className={`mod-status mod-status--${algorithm.status}`}
                    >
                      {moderationStatusLabel[algorithm.status] ?? algorithm.status}
                    </span>
                    <span
                      role="listitem"
                      className={`price-type ${algorithm.isPaid ? 'paid' : 'free'}`}
                    >
                      {algorithm.isPaid ? 'Платный' : 'Бесплатный'}
                    </span>
                    <span role="listitem" className="language">
                      {algorithm.language}
                    </span>
                  </div>
                  {algorithm.status === 'rejected' && (
                    <div className="rejection-notice" role="status">
                      <span className="rejection-notice__label">Почему отклонён</span>
                      <p className="rejection-notice__text">
                        {algorithm.rejection_reason?.trim()
                          ? algorithm.rejection_reason.trim()
                          : 'Модератор не оставил пояснения. Отредактируйте алгоритм и отправьте снова или свяжитесь с поддержкой.'}
                      </p>
                    </div>
                  )}
                  <div className="algorithm-card-actions">
                    <Link to={`/algorithm/${algorithm.id}`} className="algo-action-link">
                      Открыть
                    </Link>
                    <Link to={`/edit-algorithm/${algorithm.id}`} className="algo-action-link algo-action-link--primary">
                      Изменить
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        )}

        {activeTab === 'purchased' && (
        <div className="algorithms-section purchased-algorithms-section">
          <h2>Купленные алгоритмы ({purchases.length})</h2>
          {purchasesError && <div className="error-message">{purchasesError}</div>}
          {purchasesLoading ? (
            <div className="loading">Загрузка…</div>
          ) : purchases.length === 0 ? (
            <div className="no-algorithms">
              У вас пока нет купленных алгоритмов. Платные решения можно купить на странице алгоритма.
            </div>
          ) : (
            <div className="algorithms-list">
              {purchases.map((item) => (
                <div key={item.id} className="algorithm-card">
                  <h3>{item.algorithm.title}</h3>
                  <p>{item.algorithm.description}</p>
                  <dl className="purchased-details">
                    <div>
                      <dt>Дата и время покупки</dt>
                      <dd>
                        {new Date(item.purchasedAt).toLocaleString('ru-RU', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </dd>
                    </div>
                    <div>
                      <dt>Оплачено</dt>
                      <dd>
                        <strong>{item.purchasePrice} ₽</strong>
                      </dd>
                    </div>
                    {item.algorithm.isPaid && (
                      <div>
                        <dt>Текущая цена на площадке</dt>
                        <dd>
                          {item.algorithm.price != null ? `${item.algorithm.price} ₽` : '—'}
                          {item.algorithm.price != null &&
                            item.purchasePrice > 0 &&
                            item.algorithm.price !== item.purchasePrice && (
                              <span className="purchased-price-delta">
                                {item.algorithm.price > item.purchasePrice ? ' (↑ дороже)' : ' (↓ дешевле)'}
                              </span>
                            )}
                        </dd>
                      </div>
                    )}
                  </dl>
                  <div className="algorithm-card-actions">
                    <Link to={`/algorithm/${item.algorithm.id}`} className="algo-action-link algo-action-link--primary">
                      Открыть и смотреть код
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
};

export default Profile;