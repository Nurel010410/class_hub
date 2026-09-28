// ============================================================
// ИСПРАВЛЕННАЯ ВЕРСИЯ: getProjectsForWebsite()
// ============================================================
// СТРОГАЯ СТРУКТУРА ДАННЫХ ЛИСТА "Student_Projects" (indices 0-9):
// A(0): Team_ID             | B(1): Team_Name          | C(2): Subject
// D(3): Parent_Project_ID   | E(4): Max_Capacity       | F(5): Current_Count
// G(6): Leader_TG           | H(7): Members            | I(8): Deadline
// J(9): Status
// ============================================================

function getProjectsForWebsite() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    // Пытаемся сначала читать из Student_Projects (с родительскими проектами)
    let targetSheet = ss.getSheetByName(SHEET_NAMES.studentProjects);
    let isStudentProjects = true;

    // Если Student_Projects пуст или не существует, читаем из Projects
    if (!targetSheet || targetSheet.getLastRow() < 2) {
      targetSheet = ss.getSheetByName(SHEET_NAMES.projects);
      isStudentProjects = false;
    }

    if (!targetSheet) {
      Logger.log('⚠️ Листы Student_Projects и Projects не найдены');
      return [];
    }

    const rows = targetSheet.getDataRange().getValues();
    const result = [];
    const timeZone = Session.getScriptTimeZone();

    for (let i = 1; i < rows.length; i++) {
      // Пропускаем полностью пустые строки
      if (!rows[i][0] && !rows[i][1]) continue;

      // Пропускаем строки с временными метками (отладочные данные)
      const firstCell = String(rows[i][0] || '').trim();
      if (firstCell.includes('.') && firstCell.includes(':')) continue;

      let pId, pName, subject, parentProjectId, maxCap, curCount, leaderTg, members, deadline, status;

      if (isStudentProjects) {
        // ========== ЧИТАЕМ ИЗ ЛИСТА Student_Projects (10 КОЛОНОК) ==========
        pId = String(rows[i][0] || '').trim();                    // A: Team_ID
        pName = String(rows[i][1] || '').trim();                  // B: Team_Name
        subject = String(rows[i][2] || '').trim();                // C: Subject
        parentProjectId = String(rows[i][3] || '').trim();        // D: Parent_Project_ID
        maxCap = Number(rows[i][4]) || 0;                         // E: Max_Capacity
        curCount = Number(rows[i][5]) || 0;                       // F: Current_Count
        leaderTg = String(rows[i][6] || '').trim().replace(/^@/, '');  // G: Leader_TG (ВАЖНО! ИНДЕКС 6, НЕ 5!)
        members = String(rows[i][7] || '').trim();                // H: Members

        // I: Deadline (может быть Date или строка)
        let rawDeadline = rows[i][8];
        if (rawDeadline instanceof Date) {
          deadline = Utilities.formatDate(rawDeadline, timeZone, 'dd.MM.yyyy');
        } else {
          deadline = String(rawDeadline || '').trim();
        }

        status = String(rows[i][9] || 'Active').trim().toLowerCase();  // J: Status

      } else {
        // ========== ЧИТАЕМ ИЗ ЛИСТА Projects (9 КОЛОНОК) ==========
        pId = String(rows[i][0] || '').trim();                    // A: Project_ID
        pName = String(rows[i][1] || '').trim();                  // B: Project_Name
        subject = String(rows[i][2] || '').trim();                // C: Subject
        parentProjectId = '';                                     // Projects не имеют родителя
        maxCap = Number(rows[i][3]) || 0;                         // D: Max_Capacity
        curCount = Number(rows[i][4]) || 0;                       // E: Current_Count
        leaderTg = String(rows[i][5] || '').trim().replace(/^@/, '');  // F: Leader_TG
        members = String(rows[i][6] || '').trim();                // G: Members

        // H: Deadline
        let rawDeadline = rows[i][7];
        if (rawDeadline instanceof Date) {
          deadline = Utilities.formatDate(rawDeadline, timeZone, 'dd.MM.yyyy');
        } else {
          deadline = String(rawDeadline || '').trim();
        }

        status = String(rows[i][8] || 'Active').trim().toLowerCase();  // I: Status
      }

      // Пропускаем неактивные проекты/команды
      if (['closed', 'expired', 'archived', 'inactive'].includes(status)) {
        continue;
      }

      // Вычисляем свободные места
      const availSpots = Math.max(0, maxCap - curCount);

      // ========== ВОЗВРАЩАЕМЫЙ ОБЪЕКТ JSON ==========
      // Содержит ОРИГИНАЛЬНЫЕ ДАННЫЕ И в camelCase, И в snake_case для совместимости с фронтендом
      result.push({
        // Основные данные (оба формата)
        projectId: pId,
        project_id: pId,
        
        projectName: pName,
        project_name: pName,
        teamName: pName,
        team_name: pName,
        
        subject: subject,
        
        parentProjectId: parentProjectId,
        parent_project_id: parentProjectId,
        
        // KRITISCH: Вместимость (было maxCap, curCount - теперь правильно!)
        maxCapacity: maxCap,
        max_capacity: maxCap,
        
        currentCount: curCount,
        current_count: curCount,
        
        availableSpots: availSpots,
        available_spots: availSpots,
        
        // KRITISCH: Лидер Telegram (ИНДЕКС 6, А НЕ 5!)
        leaderTelegramId: leaderTg,
        leader_tg: leaderTg,
        leader: leaderTg,
        
        // Члены команды
        approvedMembers: members,
        members: members,
        
        // KRITISCH: Дедлайн (ИНДЕКС 8 для Student_Projects, 7 для Projects)
        deadline: deadline,
        
        // Статус
        status: status
      });
    }

    Logger.log(`✅ Прочитано ${result.length} проектов/команд для сайта`);
    return result;

  } catch (error) {
    Logger.log('❌ Ошибка в getProjectsForWebsite(): ' + error.toString());
    return [];
  }
}

// ============================================================
// ИСПРАВЛЕННАЯ ВЕРСИЯ: onFormSubmit()
// Правильно различает ДВЕ ФОРМЫ (Админ и Студент)
// ============================================================

function onFormSubmit(e) {
  try {
    if (!e) {
      Logger.log('⚠️ onFormSubmit: пустой event object');
      return;
    }

    const lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) {
      Logger.log('⚠️ onFormSubmit: не удалось получить lock');
      return;
    }

    try {
      // Определяем, какой лист обработал форму
      const sheetName = (e.range && e.range.getSheet) 
        ? e.range.getSheet().getName() 
        : '';
      
      Logger.log(`📝 onFormSubmit вызван из листа: "${sheetName}"`);

      // Парсим ответы из formData
      const answers = parseFormAnswers(e);
      Logger.log(`📋 Распарсены ��тветы:`, answers);

      // ========== РАЗЛИЧАЕМ ФОРМУ ПО КЛЮЧАМ И ИМЕНИ ЛИСТА ==========
      
      // 1. ФОРМА СТУДЕНТА "Создать команду" → handles Student_Projects
      if (answers.team_name || 
          sheetName.toLowerCase().includes('team') || 
          sheetName.toLowerCase().includes('команд') ||
          sheetName.includes('Form Responses 1')) {
        
        Logger.log('👥 Обнаружена ФОРМА СТУДЕНТА (создание команды)');
        handleTeamFormSubmission(answers);
        
      } 
      // 2. ФОРМА АДМИНА "Создать проект" → handles Projects
      else if (answers.project_name || 
               sheetName.toLowerCase().includes('проект') || 
               sheetName.toLowerCase().includes('admin')) {
        
        Logger.log('🔧 Обнаружена ФОРМА АДМИНА (создание проекта)');
        handleProjectCreationSubmission(answers, sheetName);
        
      } 
      // 3. ФОРМА ДОМАШНЕГО ЗАДАНИЯ
      else if (answers.task || 
               sheetName.toLowerCase().includes('hw') || 
               sheetName.toLowerCase().includes('дз') ||
               sheetName.toLowerCase().includes('homework')) {
        
        Logger.log('📚 Обнаружена ФОРМА ДОМАШНЕГО ЗАДАНИЯ');
        handleHomeworkSubmission(answers);
      }
      
      else {
        Logger.log('⚠️ onFormSubmit: не удалось определить тип формы');
      }

      // Пересчитываем счетчики участников и обновляем опции форм
      recalculateProjectCounts();
      updateFormProjectOptions();

    } finally {
      lock.releaseLock();
    }

  } catch (err) {
    Logger.log('❌ Критическая ошибка в onFormSubmit(): ' + err.toString());
  }
}

// ============================================================
// ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ: parseFormAnswers()
// Извлекает значения из всех типов форм
// ============================================================

function parseFormAnswers(e) {
  const result = {
    project_id: '', 
    project_name: '', 
    team_name: '',
    student_name: '', 
    student_tg: '', 
    leader_tg: '', 
    subject: '',
    task: '', 
    deadline: '', 
    max_capacity: '', 
    points: '', 
    link: ''
  };

  if (!e || !e.namedValues) {
    Logger.log('⚠️ parseFormAnswers: нет e.namedValues');
    return result;
  }

  // Проходим по всем полям формы
  Object.keys(e.namedValues).forEach(key => {
    const k = key.toLowerCase().trim();
    const val = String(e.namedValues[key][0] || '').trim();

    if (!val) return; // Пропускаем пустые значения

    // ========== ПАРСИМ ОБЫЧНЫЕ ПОЛЯ ==========
    if (k.includes('выберите проект') || k.includes('проект')) {
      const match = val.match(/(PRJ-\d+)/i);
      if (match) {
        result.project_id = match[1].toUpperCase();
        Logger.log(`✓ Найден project_id: ${result.project_id}`);
      }
    }

    if (k.includes('название команды') || k.includes('имя команды') || k.includes('команд')) {
      result.team_name = val;
      Logger.log(`✓ Найден team_name: ${result.team_name}`);
    }

    if (k.includes('название проекта') || k.includes('имя проекта')) {
      result.project_name = val;
      Logger.log(`✓ Найден project_name: ${result.project_name}`);
    }

    if (k.includes('предмет') || k.includes('дисциплина')) {
      result.subject = val;
      Logger.log(`✓ Найден subject: ${result.subject}`);
    }

    if (k.includes('вместимость') || k.includes('capacity') || k.includes('максимум')) {
      result.max_capacity = val;
      Logger.log(`✓ Найден max_capacity: ${result.max_capacity}`);
    }

    if (k.includes('дедлайн') || k.includes('срок') || k.includes('дата')) {
      result.deadline = val;
      Logger.log(`✓ Найден deadline: ${result.deadline}`);
    }

    if (k.includes('задание') || k.includes('описание') || k.includes('домашка')) {
      result.task = val;
      Logger.log(`✓ Найден task: ${result.task}`);
    }

    if (k.includes('балл') || k.includes('кредит') || k.includes('points')) {
      result.points = val;
      Logger.log(`✓ Найден points: ${result.points}`);
    }

    if (k.includes('ссылка') || k.includes('материал') || k.includes('link')) {
      result.link = val;
      Logger.log(`✓ Найден link: ${result.link}`);
    }

    // ========== ПАРСИМ TELEGRAM ДАННЫЕ ==========
    if (k.includes('telegram') || k.includes('username') || k.includes('id студента') || k.includes('телеграм')) {
      const cleanTg = val.replace(/^@/, '').trim();
      
      if (k.includes('лидер')) {
        result.leader_tg = cleanTg;
        Logger.log(`✓ Найден leader_tg: ${result.leader_tg}`);
      } else {
        // Если это студент (не явно лидер), то:
        // - если есть project_id → это заявка в команду
        // - если нет → это студент-лидер создающей команду
        result.student_tg = cleanTg;
        
        // Если leader_tg еще не установлен, копируем student_tg (это лидер новой команды)
        if (!result.leader_tg) {
          result.leader_tg = cleanTg;
        }
        Logger.log(`✓ Найден student_tg: ${result.student_tg}`);
      }
    }

    // ФИО участника
    if (k.includes('имя') || k.includes('фио') || k.includes('name')) {
      result.student_name = val;
      Logger.log(`✓ Найден student_name: ${result.student_name}`);
    }
  });

  return result;
}


// ============================================================
// ОСТАЛЬНЫЕ ФУНКЦИИ (НЕ ИЗМЕНЕНЫ, но добавлены логи)
// ============================================================

function handleTeamFormSubmission(answers) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const projectsSheet = ss.getSheetByName('Projects');

  let parentSubject = '';
  let parentDeadline = '';
  let maxCapacity = 5;

  if (projectsSheet) {
    const pData = projectsSheet.getDataRange().getValues();
    for (let i = 1; i < pData.length; i++) {
      if (String(pData[i][0]).toUpperCase() === answers.project_id) {
        parentSubject = pData[i][2] || '';
        maxCapacity = pData[i][3] || 5;
        parentDeadline = pData[i][7] || '';
        if (parentDeadline instanceof Date) {
          parentDeadline = Utilities.formatDate(parentDeadline, Session.getScriptTimeZone(), 'dd.MM.yyyy');
        }
        Logger.log(`✓ Найден родительский проект: ${answers.project_id}, Subject: ${parentSubject}`);
        break;
      }
    }
  }

  const finalTeamName = answers.team_name || 'Без названия';

  let studentProjSheet = ss.getSheetByName('Student_Projects');
  if (studentProjSheet) {
    const teamId = (answers.project_id || 'PRJ-001') + '-T' + String(studentProjSheet.getLastRow());

    studentProjSheet.appendRow([
      teamId,
      finalTeamName,
      parentSubject,
      answers.project_id,
      maxCapacity,
      1,
      answers.leader_tg,
      answers.leader_tg,
      parentDeadline,
      'Active'
    ]);

    Logger.log(`✅ Команда создана: ${teamId} - ${finalTeamName}`);

    const msg = `🎉 <b>НОВАЯ КОМАНДА НА САЙТЕ!</b>\n\n` +
      `👥 <b>Команда:</b> ${finalTeamName}\n` +
      `📁 <b>Проект:</b> ${answers.project_id}\n` +
      `👑 <b>Лидер:</b> @${answers.leader_tg.replace(/^@/, '')}\n` +
      `📅 <b>Дедлайн:</b> ${parentDeadline}`;
    
    sendTelegramNotification(msg, TELEGRAM_TOPIC_REQUESTS);
  }
}

function handleProjectCreationSubmission(answers, sheetName) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheetProjects = ss.getSheetByName(SHEET_NAMES.projects);
  if (!sheetProjects) {
    Logger.log('❌ Лист Projects не найден');
    return;
  }

  const projectId = generateNextProjectId(sheetProjects);

  sheetProjects.appendRow([
    projectId,
    answers.project_name || 'Проект',
    answers.subject || '—',
    Number(answers.max_capacity) || 4,
    1,
    answers.leader_tg || 'ADMIN',
    answers.leader_tg || 'ADMIN',
    answers.deadline || '30.12.2026',
    'Active'
  ]);

  Logger.log(`✅ Проект создан: ${projectId} - ${answers.project_name}`);
}

function handleHomeworkSubmission(answers) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  const deadlinesSheet = ss.getSheetByName(SHEET_NAMES.deadlines);
  if (deadlinesSheet) {
    deadlinesSheet.appendRow([
      answers.subject,
      answers.task,
      answers.deadline,
      answers.points,
      answers.link
    ]);
    Logger.log(`✅ Домашнее задание добавлено: ${answers.subject}`);
  }

  const hwPoolSheet = ss.getSheetByName(SHEET_NAMES.homeworkPool);
  if (hwPoolSheet) {
    const hwId = 'HW-' + String(hwPoolSheet.getLastRow()).padStart(3, '0');
    const createdAt = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    hwPoolSheet.appendRow([
      hwId,
      answers.subject,
      answers.task,
      answers.deadline,
      createdAt
    ]);
  }
}
