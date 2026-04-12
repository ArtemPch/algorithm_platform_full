import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import CodeMirror from '@uiw/react-codemirror';
import { cpp } from '@codemirror/lang-cpp';
import { oneDark } from '@codemirror/theme-one-dark';
import { apiService } from '../service/api';
import { Algorithm } from '../types';
import { useAuth } from '../contexts/AuthContext';

const SERVICE_FEE_RUB = 100;

const AddAlgorithm: React.FC = () => {
  const { id: editId } = useParams<{ id: string }>();
  const isEditMode = Boolean(editId);
  const navigate = useNavigate();
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    code: '#include <iostream>\n#include <vector>\n\nusing namespace std;\n\n// Ваш алгоритм здесь\nvoid yourAlgorithm() {\n    // Реализация алгоритма\n    cout << "Hello, Algorithm Platform!" << endl;\n}',
    tags: '',
    isPaid: false,
    price: '200',
    language: 'C++',
    compiler: 'g++',
  });

  const [showPrice, setShowPrice] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadExisting, setLoadExisting] = useState(isEditMode);
  const [initialLoadError, setInitialLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEditMode || !editId || !user?.username) return;

    let cancelled = false;
    (async () => {
      try {
        setLoadExisting(true);
        setInitialLoadError(null);
        const existing = await apiService.getAlgorithmById(editId);
        if (cancelled) return;
        if (existing.author !== user.username && existing.author_name !== user.username) {
          setInitialLoadError('Вы можете редактировать только свои алгоритмы.');
          return;
        }
        setFormData({
          title: existing.title,
          description: existing.description,
          code: existing.code ?? '',
          tags: existing.tags?.length ? existing.tags.join(', ') : '',
          isPaid: existing.isPaid,
          price: String(existing.price ?? (existing.isPaid ? 200 : 0)),
          language: existing.language || 'C++',
          compiler: existing.compiler || 'g++',
        });
        setShowPrice(existing.isPaid);
      } catch (err) {
        if (!cancelled) {
          setInitialLoadError(err instanceof Error ? err.message : 'Не удалось загрузить алгоритм');
        }
      } finally {
        if (!cancelled) setLoadExisting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isEditMode, editId, user?.username]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.username) {
      setError('Войдите в аккаунт, чтобы добавить алгоритм.');
      return;
    }
    if (formData.isPaid) {
      const salePrice = Number(formData.price);
      if (!Number.isFinite(salePrice) || salePrice < 101) {
        setError(
          `Для платного алгоритма цена должна быть не меньше 101 ₽ (после комиссии ${SERVICE_FEE_RUB} ₽ вы получите хотя бы 1 ₽ с продажи).`
        );
        return;
      }
    }
    setLoading(true);
    setError(null);

    try {
      // Преобразуем теги из строки в массив
      const tagsArray = formData.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
      
      // Подготавливаем данные для отправки
      const algorithmData: Partial<Algorithm> = {
        title: formData.title,
        description: formData.description,
        code: formData.code,
        tags: tagsArray,
        isPaid: formData.isPaid,
        price: formData.isPaid ? Number(formData.price) : undefined,
        language: formData.language,
        compiler: formData.compiler,
        author: user.username,
      };

      if (isEditMode && editId) {
        await apiService.updateAlgorithm(editId, algorithmData);
        navigate('/profile', {
          replace: true,
          state: {
            profileTab: 'my-algorithms' as const,
            toast: {
              title: 'Сохранено',
              message: 'Изменения записаны. Алгоритм снова отправлен на модерацию.',
            },
          },
        });
      } else {
        await apiService.createAlgorithm(algorithmData);
        navigate('/', {
          replace: true,
          state: {
            toast: {
              title: 'Отправлено',
              message: 'Алгоритм отправлен на модерацию. Скоро он появится в поиске после проверки.',
            },
          },
        });
      }

    } catch (err) {
      console.error('Ошибка при создании алгоритма:', err);
      const errorMessage = err instanceof Error ? err.message : 'Произошла ошибка при отправке алгоритма';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
  };

  const handleCodeChange = (value: string) => {
    setFormData(prev => ({
      ...prev,
      code: value
    }));
  };

  const togglePaid = () => {
    const newIsPaid = !formData.isPaid;
    setFormData(prev => ({
      ...prev,
      isPaid: newIsPaid,
      price: newIsPaid ? '200' : '0'
    }));
    
    if (newIsPaid) {
      setShowPrice(true);
    } else {
      setTimeout(() => setShowPrice(false), 300);
    }
  };

  const salePriceNum = Number(formData.price);
  const authorNetRub =
    formData.isPaid && Number.isFinite(salePriceNum)
      ? Math.max(0, Math.round(salePriceNum) - SERVICE_FEE_RUB)
      : 0;

  if (loadExisting) {
    return (
      <div className="add-algorithm-page">
        <p>Загрузка алгоритма…</p>
      </div>
    );
  }

  if (isEditMode && initialLoadError) {
    return (
      <div className="add-algorithm-page">
        <div className="error-message">{initialLoadError}</div>
        <p>
          <Link to="/profile">← Назад к профилю</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="add-algorithm-page">
      <h1>{isEditMode ? 'Редактировать алгоритм' : 'Добавить новый алгоритм'}</h1>
      {isEditMode && (
        <p style={{ marginBottom: '1rem' }}>
          <Link to="/profile">← Назад к профилю</Link>
        </p>
      )}

      {error && (
        <div className="error-message">
          <strong>Ошибка:</strong> {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="title">Название алгоритма</label>
          <input
            type="text"
            id="title"
            name="title"
            value={formData.title}
            onChange={handleChange}
            placeholder="Введите название алгоритма"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="description">Описание</label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleChange}
            placeholder="Опишите алгоритм, его особенности и применение"
            required
            rows={4}
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="language">Язык программирования</label>
            <select
              id="language"
              name="language"
              value={formData.language}
              onChange={handleChange}
            >
              <option value="C++">C/C++</option>
              <option value="Python">Python</option>
              <option value="JavaScript">JavaScript</option>
              <option value="Java">Java</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="compiler">Компилятор</label>
            <select
              id="compiler"
              name="compiler"
              value={formData.compiler}
              onChange={handleChange}
            >
              <option value="g++">g++ (GCC)</option>
              <option value="gcc">gcc (GCC)</option>
              <option value="clang">clang (LLVM)</option>
              <option value="clang++">clang++ (LLVM)</option>
              <option value="python">Python Interpreter</option>
              <option value="node">Node.js</option>
              <option value="java">Java Compiler</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="code">Исходный код</label>
          <div className="code-editor-container">
            <CodeMirror
              value={formData.code}
              height="400px"
              extensions={[cpp()]}
              theme={oneDark}
              onChange={handleCodeChange}
              basicSetup={{
                lineNumbers: true,
                highlightActiveLine: true,
                highlightSelectionMatches: true,
                indentOnInput: true,
                bracketMatching: true,
                closeBrackets: true,
                autocompletion: true,
                rectangularSelection: true,
                crosshairCursor: true,
                highlightSpecialChars: true,
                syntaxHighlighting: true,
              }}
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="tags">Теги (через запятую)</label>
          <input
            type="text"
            id="tags"
            name="tags"
            value={formData.tags}
            onChange={handleChange}
            placeholder="сортировка, C++, алгоритмы, графы"
          />
          <small>Укажите ключевые слова для поиска алгоритма</small>
        </div>

        <div className="form-group">
          <div className="paid-toggle-section">
            <div className="toggle-container">
              <span className="toggle-label">Платный алгоритм</span>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={formData.isPaid}
                  onChange={togglePaid}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            {formData.isPaid && (
              <div className="paid-commission-banner" role="note">
                <div className="paid-commission-banner__accent" aria-hidden="true" />
                <div className="paid-commission-banner__body">
                  <p className="paid-commission-banner__title">Комиссия сервиса</p>
                  <p className="paid-commission-banner__text">
                    С каждой успешной продажи удерживается фиксированная комиссия{' '}
                    <strong>{SERVICE_FEE_RUB} ₽</strong>. Итоговая сумма переводится вам после вычета
                    этой комиссии.
                  </p>
                  <div className="paid-commission-banner__net">
                    <span className="paid-commission-banner__net-label">Вы получите с одной продажи</span>
                    <span className="paid-commission-banner__net-value">{authorNetRub} ₽</span>
                  </div>
                  {authorNetRub <= 0 && (
                    <p className="paid-commission-banner__warn">
                      Укажите цену выше {SERVICE_FEE_RUB} ₽, иначе выплата автору будет нулевой.
                    </p>
                  )}
                </div>
              </div>
            )}
            
            <div className={`price-input-wrapper ${showPrice ? 'visible' : 'hidden'}`}>
              <div className="price-input-container">
                <label htmlFor="price">Стоимость алгоритма</label>
                <div className="price-input-group">
                  <input
                    type="number"
                    id="price"
                    name="price"
                    value={formData.price}
                    onChange={handleChange}
                    min="101"
                    max="10000"
                    placeholder="200"
                    className="price-input"
                    disabled={!formData.isPaid}
                  />
                  <span className="currency">руб.</span>
                </div>
                <p className="price-hint">Цена для покупателя, не ниже 101 ₽ (с учётом комиссии {SERVICE_FEE_RUB} ₽)</p>
              </div>
            </div>
          </div>
        </div>

        <button 
          type="submit" 
          className="submit-btn"
          disabled={loading}
        >
          {loading ? 'Сохранение...' : isEditMode ? 'Сохранить изменения' : 'Отправить на проверку'}
        </button>
      </form>

      <style jsx>{`
        .error-message {
          background-color: #f8d7da;
          color: #721c24;
          padding: 12px;
          border-radius: 4px;
          margin-bottom: 20px;
          border: 1px solid #f5c6cb;
        }

        .submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        small {
          color: #666;
          font-size: 12px;
          margin-top: 4px;
          display: block;
        }
      `}</style>
    </div>
  );
};

export default AddAlgorithm;