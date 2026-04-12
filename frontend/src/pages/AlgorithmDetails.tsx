import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiService } from '../service/api';
import { ModeratedAlgorithm } from '../types';
import { useAuth } from '../contexts/AuthContext';
import PriceMonitorPanel from '../components/PriceMonitorPanel';
import './AlgorithmDetails.css';

const AlgorithmDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [algorithm, setAlgorithm] = useState<ModeratedAlgorithm | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [priceChartNonce, setPriceChartNonce] = useState(0);

  useEffect(() => {
    const fetchAlgorithm = async () => {
      if (!id) return;
      
      try {
        setLoading(true);
        const data = await apiService.getAlgorithmById(id);
        setAlgorithm(data);
      } catch (err) {
        setError('Ошибка загрузки алгоритма');
        console.error('Failed to fetch algorithm:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAlgorithm();
  }, [id, user?.username]);

  const handlePurchase = async () => {
    if (!id || !user) return;
    setPurchaseLoading(true);
    setPurchaseError(null);
    try {
      const updated = await apiService.purchaseAlgorithm(id);
      setAlgorithm(updated);
      setPriceChartNonce((n) => n + 1);
    } catch (err) {
      setPurchaseError(err instanceof Error ? err.message : 'Не удалось оформить покупку');
    } finally {
      setPurchaseLoading(false);
    }
  };

  const handleCopyCode = async () => {
    if (!algorithm?.code) return;
    
    try {
      await navigator.clipboard.writeText(algorithm.code);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  if (loading) {
    return (
      <div className="algorithm-details">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <div className="loading-text">Загрузка алгоритма...</div>
        </div>
      </div>
    );
  }

  if (error || !algorithm) {
    return (
      <div className="algorithm-details">
        <div className="error-container">
          <div className="error-icon">⚠️</div>
          <div className="error-text">{error || 'Алгоритм не найден'}</div>
          <button onClick={() => navigate('/')} className="back-btn error-btn">
            Вернуться на главную
          </button>
        </div>
      </div>
    );
  }

  const canViewCode = !algorithm.isPaid || Boolean(algorithm.codeVisible);
  const showCodeBlock = canViewCode && Boolean(algorithm.code?.trim());
  const showPaywall = algorithm.isPaid && !canViewCode;

  return (
    <div className="algorithm-details">
      <div className="details-header">
        <button
          type="button"
          className="back-link"
          onClick={() => navigate(-1)}
        >
          <span className="back-arrow">←</span>
          Назад
        </button>
        <h1 className="algorithm-title">{algorithm.title}</h1>
        <div className="algorithm-meta">
          <div className="meta-badges">
            <div className="meta-badge">
              <span className="badge-icon">👤</span>
              <div className="badge-content">
                <span className="badge-label">Автор</span>
                <span className="badge-value">{algorithm.author}</span>
              </div>
            </div>
            <div className="meta-badge">
              <span className="badge-icon">📅</span>
              <div className="badge-content">
                <span className="badge-label">Добавлен</span>
                <span className="badge-value">
                  {new Date(algorithm.createdAt).toLocaleDateString('ru-RU')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="details-content">
        <div className="main-content">
          <section className="content-section">
            <h2 className="section-title">Описание</h2>
            <div className="description-text">
              <p>{algorithm.description}</p>
            </div>
          </section>

          {algorithm.isPaid && (
            <PriceMonitorPanel
              key={`${algorithm.id}-${priceChartNonce}-${algorithm.updatedAt}`}
              algorithmId={algorithm.id}
              currentPrice={algorithm.price}
            />
          )}

          {showPaywall && (
            <section className="content-section paywall-section">
              <h2 className="section-title">Код алгоритма</h2>
              <p className="paywall-note">
                Исходный код этого алгоритма доступен после покупки. Оплата сейчас имитируется: при нажатии
                «Купить» доступ открывается сразу.
              </p>
              {algorithm.price != null && (
                <p className="paywall-price">{algorithm.price} ₽</p>
              )}
              {purchaseError && (
                <div className="error-inline" style={{ color: '#c0392b', marginBottom: '0.75rem' }}>
                  {purchaseError}
                </div>
              )}
              {user ? (
                <button
                  type="button"
                  className="buy-btn"
                  onClick={handlePurchase}
                  disabled={purchaseLoading}
                >
                  {purchaseLoading ? 'Обработка…' : `Купить за ${algorithm.price ?? '—'} ₽`}
                </button>
              ) : (
                <p className="paywall-login">
                  <Link to="/login">Войдите</Link>, чтобы купить алгоритм.
                </p>
              )}
            </section>
          )}

          {showCodeBlock && (
            <section className="content-section">
              <div className="section-header">
                <h2 className="section-title">Код алгоритма</h2>
                <div className="code-meta">
                  <span className="language-badge">{algorithm.language}</span>
                  <span className="compiler-badge">{algorithm.compiler}</span>
                </div>
              </div>
              <div className="code-container">
                <button 
                  className={`copy-btn ${isCopied ? 'copied' : ''}`}
                  onClick={handleCopyCode}
                  title="Копировать код"
                >
                  {isCopied ? (
                    <>
                      <span className="copy-icon">✓</span>
                      Скопировано!
                    </>
                  ) : (
                    <>
                      <span className="copy-icon">📋</span>
                      Копировать
                    </>
                  )}
                </button>
                <pre className="code-block">
                  <code>{algorithm.code}</code>
                </pre>
              </div>
            </section>
          )}
        </div>

        <aside className="sidebar">
          <div className="info-card">
            <h3 className="card-title">Детали алгоритма</h3>
            
            <div className="info-grid">
              <div className="info-row">
                <span className="info-label">Тип:</span>
                <span className={`info-value ${algorithm.isPaid ? 'paid' : 'free'}`}>
                  {algorithm.isPaid ? 'Платный' : 'Бесплатный'}
                </span>
              </div>
              
              {algorithm.isPaid && algorithm.price && (
                <div className="info-row">
                  <span className="info-label">Цена:</span>
                  <span className="info-value price">{algorithm.price} руб.</span>
                </div>
              )}
              
              <div className="info-row">
                <span className="info-label">Обновлен:</span>
                <span className="info-value">
                  {new Date(algorithm.updatedAt).toLocaleDateString('ru-RU')}
                </span>
              </div>
            </div>
          </div>

          {algorithm.tags.length > 0 && (
            <div className="tags-card">
              <h3 className="card-title">Теги</h3>
              <div className="tags-container">
                {algorithm.tags.map(tag => (
                  <span key={tag} className="tag">{tag}</span>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};

export default AlgorithmDetails;