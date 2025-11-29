import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';

// n8n Webhook URL за обработка на разходи
const N8N_WEBHOOK_URL = "https://n8n.simeontsvetanovn8nworkflows.site/webhook/expense-submit";

// Типове
interface Employee {
  fullName: string;
  employeeId: string;
}

interface Expense {
  id: string;
  employee_id: string;
  receipt_image_url: string | null;
  merchant: string | null;
  receipt_date: string | null;
  amount: number;
  currency: string;
  category: string;
  status: 'Approved' | 'Rejected' | 'Manual Review';
  status_reason: string | null;
  comment: string | null;
  created_at: string;
}

// Допустими файлови формати
const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_EXTENSIONS = '.jpg,.jpeg,.png,.webp,.gif';

function App() {
  // Employee state
  const [employee, setEmployee] = useState<Employee>({ fullName: '', employeeId: '' });
  const [employeeMessage, setEmployeeMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isEmployeeSaved, setIsEmployeeSaved] = useState(false);

  // New Expense state
  const [comment, setComment] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expenseMessage, setExpenseMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // History state
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // Зареждане на employee данни от localStorage при първоначално зареждане
  useEffect(() => {
    const savedEmployee = localStorage.getItem('techcorp_employee');
    if (savedEmployee) {
      try {
        const parsed = JSON.parse(savedEmployee);
        if (parsed.fullName && parsed.employeeId) {
          setEmployee(parsed);
          setIsEmployeeSaved(true);
        }
      } catch (e) {
        console.error('Error parsing saved employee data:', e);
      }
    }
  }, []);

  // Функция за зареждане на история от Supabase
  const fetchExpenseHistory = useCallback(async () => {
    if (!isEmployeeSaved || !employee.fullName || !employee.employeeId) {
      return;
    }

    setIsLoadingHistory(true);
    setHistoryError(null);

    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('employee_id', employee.employeeId)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      setExpenses(data || []);
    } catch (error: any) {
      console.error('Error fetching expenses:', error);
      setHistoryError('Грешка при зареждане на историята. Моля, опитайте отново.');
    } finally {
      setIsLoadingHistory(false);
    }
  }, [employee.fullName, employee.employeeId, isEmployeeSaved]);

  // Зареждане на история когато employee се промени или е записан
  useEffect(() => {
    if (isEmployeeSaved) {
      fetchExpenseHistory();
    }
  }, [isEmployeeSaved, fetchExpenseHistory]);

  // Запазване на employee данни
  const handleSaveEmployee = () => {
    setEmployeeMessage(null);

    if (!employee.fullName.trim()) {
      setEmployeeMessage({ type: 'error', text: 'Моля, въведете пълното си име.' });
      return;
    }

    if (!employee.employeeId.trim()) {
      setEmployeeMessage({ type: 'error', text: 'Моля, въведете служебния си номер.' });
      return;
    }

    // Запазване в localStorage
    localStorage.setItem('techcorp_employee', JSON.stringify({
      fullName: employee.fullName.trim(),
      employeeId: employee.employeeId.trim()
    }));

    setIsEmployeeSaved(true);
    setEmployeeMessage({ type: 'success', text: 'Данните са запазени успешно!' });

    // Изчистване на съобщението след 3 секунди
    setTimeout(() => setEmployeeMessage(null), 3000);
  };

  // Обработка на избор на файл
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!ALLOWED_FILE_TYPES.includes(file.type)) {
        setExpenseMessage({ 
          type: 'error', 
          text: 'Невалиден формат на файла. Позволени са: JPG, JPEG, PNG, WEBP, GIF.' 
        });
        setSelectedFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }
      setSelectedFile(file);
      setExpenseMessage(null);
    }
  };

  // Изпращане на разход
  const handleSubmitExpense = async () => {
    setExpenseMessage(null);

    // Проверка дали има запазен служител
    if (!isEmployeeSaved || !employee.fullName || !employee.employeeId) {
      setExpenseMessage({ 
        type: 'error', 
        text: 'Моля, първо въведете и запазете вашите данни в секция "Идентификация".' 
      });
      return;
    }

    // Проверка дали има поне файл или коментар
    if (!selectedFile && !comment.trim()) {
      setExpenseMessage({ 
        type: 'error', 
        text: 'Моля, качете снимка на касова бележка или въведете описание на разхода.' 
      });
      return;
    }

    // Валидация на файла ако е избран
    if (selectedFile && !ALLOWED_FILE_TYPES.includes(selectedFile.type)) {
      setExpenseMessage({ 
        type: 'error', 
        text: 'Невалиден формат на файла. Позволени са: JPG, JPEG, PNG, WEBP, GIF.' 
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Създаване на FormData
      const formData = new FormData();
      formData.append('full_name', employee.fullName);
      formData.append('employee_id', employee.employeeId);
      formData.append('comment', comment.trim());
      
      if (selectedFile) {
        formData.append('receipt_file', selectedFile);
      }

      // Изпращане към n8n webhook
      const response = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Опит за парсване на JSON отговор
      let responseData: any = null;
      const contentType = response.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        try {
          responseData = await response.json();
        } catch {
          // Отговорът не е валиден JSON
        }
      }

      // Изчистване на формата
      setComment('');
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      // Показване на съобщение за успех
      if (responseData && responseData.status) {
        setExpenseMessage({ 
          type: 'success', 
          text: `Разходът е обработен! Статус: ${responseData.status}${responseData.reason ? ` - ${responseData.reason}` : ''}` 
        });
      } else {
        setExpenseMessage({ 
          type: 'success', 
          text: 'Разходът е изпратен успешно за обработка!' 
        });
      }

      // Обновяване на историята
      setTimeout(() => {
        fetchExpenseHistory();
      }, 1000);

    } catch (error: any) {
      console.error('Error submitting expense:', error);
      setExpenseMessage({ 
        type: 'error', 
        text: `Грешка при изпращане на разхода: ${error.message || 'Моля, опитайте отново.'}` 
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Изчисляване на статистики
  const calculateStats = () => {
    const total = expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
    const approved = expenses.filter(exp => exp.status === 'Approved').length;
    const rejected = expenses.filter(exp => exp.status === 'Rejected').length;
    const pending = expenses.filter(exp => exp.status === 'Manual Review').length;

    // Групиране по категории
    const byCategory: { [key: string]: number } = {};
    expenses.forEach(exp => {
      const cat = exp.category || 'Други';
      byCategory[cat] = (byCategory[cat] || 0) + (exp.amount || 0);
    });

    return { total, approved, rejected, pending, byCategory };
  };

  const stats = calculateStats();

  // Форматиране на дата
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleDateString('bg-BG');
    } catch {
      return dateStr;
    }
  };

  // Форматиране на сума
  const formatAmount = (amount: number, currency: string = 'BGN') => {
    return `${amount.toFixed(2)} ${currency}`;
  };

  // Получаване на CSS клас за статус
  const getStatusClass = (status: string) => {
    switch (status) {
      case 'Approved':
        return 'status-approved';
      case 'Rejected':
        return 'status-rejected';
      case 'Manual Review':
        return 'status-pending';
      default:
        return '';
    }
  };

  // Превод на статус
  const translateStatus = (status: string) => {
    switch (status) {
      case 'Approved':
        return 'Одобрен';
      case 'Rejected':
        return 'Отказан';
      case 'Manual Review':
        return 'За преглед';
      default:
        return status;
    }
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <h1>💼 TechCorp</h1>
        <p>Система за отчитане на разходи</p>
      </header>

      {/* Секция 1: Идентификация на служител */}
      <section className="card">
        <h2 className="card-title">👤 Идентификация на служител</h2>
        
        <div className="form-group">
          <label htmlFor="fullName">Пълно име</label>
          <input
            type="text"
            id="fullName"
            value={employee.fullName}
            onChange={(e) => setEmployee({ ...employee, fullName: e.target.value })}
            placeholder="Иван Иванов"
          />
        </div>

        <div className="form-group">
          <label htmlFor="employeeId">Служебен номер</label>
          <input
            type="text"
            id="employeeId"
            value={employee.employeeId}
            onChange={(e) => setEmployee({ ...employee, employeeId: e.target.value })}
            placeholder="EMP001"
          />
        </div>

        <button className="btn btn-primary" onClick={handleSaveEmployee}>
          💾 Запази
        </button>

        {employeeMessage && (
          <div className={`message message-${employeeMessage.type}`}>
            {employeeMessage.text}
          </div>
        )}
      </section>

      {/* Секция 2: Нов разход */}
      <section className="card">
        <h2 className="card-title">📝 Нов разход</h2>

        <div className="form-group">
          <label htmlFor="receipt">Снимка на касова бележка</label>
          <input
            type="file"
            id="receipt"
            ref={fileInputRef}
            accept={ALLOWED_EXTENSIONS}
            onChange={handleFileChange}
          />
          {selectedFile && (
            <p style={{ fontSize: '0.8rem', color: '#666', marginTop: '4px' }}>
              Избран файл: {selectedFile.name}
            </p>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="comment">Коментар / Описание</label>
          <textarea
            id="comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Опишете разхода или добавете допълнителна информация..."
          />
        </div>

        <button 
          className="btn btn-primary" 
          onClick={handleSubmitExpense}
          disabled={isSubmitting}
        >
          {isSubmitting ? '⏳ Изпращане...' : '📤 Изпрати разход'}
        </button>

        {expenseMessage && (
          <div className={`message message-${expenseMessage.type}`}>
            {expenseMessage.text}
          </div>
        )}
      </section>

      {/* Секция 3: История */}
      <section className="card">
        <h2 className="card-title">📊 История на разходите</h2>

        {!isEmployeeSaved ? (
          <div className="empty-state">
            <p>👆 Моля, въведете и запазете вашето име и служебен номер, за да видите историята на разходите.</p>
          </div>
        ) : (
          <>
            <div className="history-header">
              <span style={{ color: '#666', fontSize: '0.875rem' }}>
                {employee.fullName} ({employee.employeeId})
              </span>
              <button 
                className="btn btn-secondary btn-small" 
                onClick={fetchExpenseHistory}
                disabled={isLoadingHistory}
              >
                🔄 Обнови
              </button>
            </div>

            {/* Статистики */}
            {expenses.length > 0 && (
              <>
                <div className="summary-section">
                  <div className="summary-card">
                    <div className="value">{formatAmount(stats.total)}</div>
                    <div className="label">Общо разходи</div>
                  </div>
                  <div className="summary-card">
                    <div className="value" style={{ color: '#28a745' }}>{stats.approved}</div>
                    <div className="label">Одобрени</div>
                  </div>
                  <div className="summary-card">
                    <div className="value" style={{ color: '#dc3545' }}>{stats.rejected}</div>
                    <div className="label">Отказани</div>
                  </div>
                  <div className="summary-card">
                    <div className="value" style={{ color: '#ffc107' }}>{stats.pending}</div>
                    <div className="label">За преглед</div>
                  </div>
                </div>

                {/* Разбивка по категории */}
                <div className="category-breakdown">
                  <h4 style={{ fontSize: '0.9rem', marginBottom: '8px', color: '#555' }}>
                    Разбивка по категории:
                  </h4>
                  {Object.entries(stats.byCategory).map(([category, amount]) => (
                    <div key={category} className="category-item">
                      <span className="category-name">{category}</span>
                      <span className="category-amount">{formatAmount(amount)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Зареждане */}
            {isLoadingHistory && (
              <div className="loading">⏳ Зареждане...</div>
            )}

            {/* Грешка */}
            {historyError && (
              <div className="message message-error">{historyError}</div>
            )}

            {/* Таблица с разходи */}
            {!isLoadingHistory && !historyError && expenses.length === 0 && (
              <div className="empty-state">
                <p>📭 Все още нямате регистрирани разходи.</p>
              </div>
            )}

            {!isLoadingHistory && expenses.length > 0 && (
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Категория</th>
                    <th>Сума</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((expense) => (
                    <tr key={expense.id}>
                      <td>{formatDate(expense.receipt_date || expense.created_at)}</td>
                      <td>{expense.category || '-'}</td>
                      <td>{formatAmount(expense.amount, expense.currency)}</td>
                      <td>
                        <span className={`status-badge ${getStatusClass(expense.status)}`}>
                          {translateStatus(expense.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>

      {/* Footer */}
      <footer style={{ textAlign: 'center', padding: '16px', color: '#888', fontSize: '0.8rem' }}>
        TechCorp Expense Tracker PoC © 2025
      </footer>
    </div>
  );
}

export default App;
