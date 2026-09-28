// ============================================================
// CLASS HUB — Google Apps Script (Telegram + Google Forms + Sheets)
// ============================================================

const BOT_TOKEN = '8727223928:AAHCu-jJhFWmyqY4r0iUPWOJD445SbZNa9o';
const SPREADSHEET_ID = '1ygTKJmW_9GWwPspc1RY2yJjvfI8WT5XsFf2NNZuAT_M';
const WEBHOOK_URL = 'https://class-hub.nureldinmuhamedov010410.workers.dev/';
const WEBHOOK_SECRET = '1234899384';

const TELEGRAM_CHAT_ID = '-1004379161096';
const TELEGRAM_TOPIC_GENERAL = 1;
const TELEGRAM_TOPIC_REQUESTS = 3;

const SHEET_NAMES = {
  projects: 'Projects',
  joinRequests: 'Join_Requests',
  adminIds: 'Admin_IDs',
  deadlines: 'Deadlines',
  homeworkPool: 'Homework_Pool',
  schedule: 'Schedule',
  groups: 'Groups',
  syllabus: 'Syllabus',
  studentProjects: 'Student_Projects',
  responses: 'Form Responses 1'
};

const FORM_TITLES = {
  adminForm: 'Админская форма проекта',
  studentForm: 'Создать команду проекта',
  joinRequestForm: 'Заявка на вступление в команду'
};

const CONFIG = {
  TEAM_FORM_ID: '1PCasYaKY3YepLZrwjBA272-kUZa4bDlVGThxP4mZ1b4',
  PROJECT_QUESTION_TITLE: 'Выберите проект',
  SHEETS: {
    DEADLINES: 'Deadlines',
    PROJECTS: 'Projects',
    STUDENT_PROJECTS: 'Student_Projects',
    RESPONSES_DEADLINES: 'Form Responses 1',
    RESPONSES_PROJECTS: 'Form Responses 2'
  }
};

// ============================================================
// 1. WEBHOOK / doPost / doGet
// ============================================================

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return HtmlService.createHtmlOutput('No data');
    }

    const data = JSON.parse(e.postData.contents);

    if (data.message) {
      handleTextMessage(data.message);
      return HtmlService.createHtmlOutput('OK');
    }
    if (data.callback_query) {
      handleTelegramCallbackQuery(data.callback_query);
      return HtmlService.createHtmlOutput('OK');
    }

    if (data.action === 'joinProjectRequest' || data.action === 'join_request' || data.projectId) {
      handleJoinRequestSubmission({
        project_id: data.projectId || data.project_id || '',
        student_name: data.studentName || data.student_name || data.name || 'Участник',
        student_tg: data.studentId || data.student_tg || data.telegram || ''
      });
      return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'Заявка отправлена' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === 'general_question') {
      sendTelegramNotification(`❓ <b>Вопрос с сайта:</b> ${data.question}`, TELEGRAM_TOPIC_GENERAL);
      return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'Вопрос отправлен' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return HtmlService.createHtmlOutput('OK');

  } catch (error) {
    Logger.log('❌ Ошибка doPost: ' + error.toString());
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || 'getAll';

    if (action === 'getProjects') {
      return createJsonResponse({ status: 'success', data: getProjectsForWebsite() });
    }
    if (action === 'getDeadlines') {
      return createJsonResponse({ status: 'success', data: getDeadlinesForWebsite() });
    }
    if (action === 'getSyllabus') {
      return createJsonResponse({ status: 'success', data: getSheetData(SHEET_NAMES.syllabus) });
    }

    return createJsonResponse({
      status: 'success',
      projects: getProjectsForWebsite(),
      deadlines: getDeadlinesForWebsite(),
      syllabus: getSheetData(SHEET_NAMES.syllabus)
    });

  } catch (err) {
    return createJsonResponse({ status: 'error', error: err.toString() });
  }
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// 2. Telegram message & Callback handlers
// ============================================================

function handleTextMessage(message) {
  try {
    const chatId = message && message.chat && message.chat.id;
    const text = (message && (message.text || message.caption) || '').trim();

    if (!chatId || !text) return;

    if (text.startsWith('/start') || text.startsWith('/help')) {
      const helpText = '👋 Привет! Я Class Hub бот.\n\n' +
        'Я могу помочь с:\n' +
        '• ДЗ и дедлайнами\n' +
        '• Расписанием\n' +
        '• Проектами и командами\n\n' +
        'Например: «Что задавали по математике?»';
      sendTelegramMessage(chatId, helpText);
      return;
    }

    const replyText = processUserQuery(text);
    if (replyText) {
      sendTelegramMessage(chatId, replyText);
    }
  } catch (error) {
    Logger.log('❌ Ошибка handleTextMessage: ' + error.toString());
    if (message && message.chat && message.chat.id) {
      sendTelegramMessage(message.chat.id, '❌ Произошла ошибка при обработке запроса.');
    }
  }
}

function handleTelegramCallbackQuery(callbackQuery) {
  try {
    if (!callbackQuery || !callbackQuery.data) return;

    const callbackId = callbackQuery.id;
    const user = callbackQuery.from || {};
    const userId = String(user.id || '');
    const username = String(user.username || '').replace(/^@/, '').toLowerCase();
    const data = callbackQuery.data;
    const telegramMessage = callbackQuery.message || null;

    if (data.indexOf('app_') === 0) {
      handleApproveRequest(data.replace(/^app_/, ''), userId, username, callbackId, telegramMessage);
      return;
    }

    if (data.indexOf('rej_') === 0) {
      handleRejectRequest(data.replace(/^rej_/, ''), userId, username, callbackId, telegramMessage);
      return;
    }

    answerCallbackQuery(callbackId, 'Неизвестное действие', true);
  } catch (error) {
    Logger.log('❌ Ошибка handleTelegramCallbackQuery: ' + error.toString());
  }
}

function getProjectColumnMap(sheet) {
  const headers = sheet.getLastColumn()
    ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
      .map(value => String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'))
    : [];
  const isTeamSchema = sheet.getName() === SHEET_NAMES.studentProjects &&
    (headers.includes('team_id') || headers.includes('parent_project_id'));

  if (isTeamSchema) {
    return {
      id: 0, name: 1, subject: 2, parentProjectId: 3, maxCapacity: 4,
      currentCount: 5, leader: 6, members: 7, deadline: 8, status: 9,
      teamSchema: true
    };
  }

  return {
    id: 0, name: 1, subject: 2, parentProjectId: -1, maxCapacity: 3,
    currentCount: 4, leader: 5, members: 6, deadline: 7, status: 8,
    teamSchema: false
  };
}

function findProjectRowById(ss, projectId) {
  for (const sheetName of [SHEET_NAMES.studentProjects, SHEET_NAMES.projects]) {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) continue;

    const values = sheet.getDataRange().getValues();
    const columns = getProjectColumnMap(sheet);
    for (let row = 1; row < values.length; row++) {
      if (String(values[row][columns.id] || '').trim().toLowerCase() ===
          String(projectId || '').trim().toLowerCase()) {
        return { sheet: sheet, values: values, columns: columns, row: row };
      }
    }
  }
  return null;
}

function isUserAuthorized(userId, username, leaderTelegramId) {
  const cleanUsername = String(username || '').replace(/^@/, '').trim().toLowerCase();
  const cleanUserId = String(userId || '').trim().toLowerCase();
  const cleanLeader = String(leaderTelegramId || '').replace(/^@/, '').trim().toLowerCase();

  if (cleanLeader && (cleanLeader === cleanUsername || cleanLeader === cleanUserId)) {
    return true;
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const adminSheet = ss.getSheetByName(SHEET_NAMES.adminIds);
  if (!adminSheet) return false;

  const admins = adminSheet.getDataRange().getValues().flat()
    .map(value => String(value).replace(/^@/, '').trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(cleanUsername) || admins.includes(cleanUserId);
}

function handleApproveRequest(requestId, userId, username, callbackId, tgMessage) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) {
      answerCallbackQuery(callbackId, 'Операция занята. Попробуйте позже.', true);
      return;
    }

    try {
      const joinSheet = ss.getSheetByName(SHEET_NAMES.joinRequests);
      const projectsSheet = ss.getSheetByName(SHEET_NAMES.studentProjects) || ss.getSheetByName(SHEET_NAMES.projects);

      if (!joinSheet || !projectsSheet) {
        answerCallbackQuery(callbackId, 'Лист заявки или проекта не найден.', true);
        return;
      }

      const joinData = joinSheet.getDataRange().getValues();

      let requestRow = -1;
      let projectId = '';
      let studentTelegramId = '';

      for (let i = 1; i < joinData.length; i++) {
        if (String(joinData[i][0]).trim() === String(requestId).trim()) {
          requestRow = i;
          projectId = String(joinData[i][1] || '').trim();
          studentTelegramId = String(joinData[i][2] || '').trim();
          break;
        }
      }

      if (requestRow === -1) {
        answerCallbackQuery(callbackId, 'Заявка не найдена.', true);
        return;
      }
      const requestStatus = String(joinData[requestRow][4] || '').trim().toLowerCase();
      if (requestStatus === 'approved' || requestStatus === 'rejected') {
        answerCallbackQuery(callbackId, 'Заявка уже обработана.', true);
        return;
      }

      const project = findProjectRowById(ss, projectId);
      if (!project) {
        answerCallbackQuery(callbackId, 'Проект не найден.', true);
        return;
      }
      const columns = project.columns;
      const projectRow = project.row;
      const projectData = project.values[projectRow];
      const leaderTelegramId = String(projectData[columns.leader] || '').trim();
      const projectName = String(projectData[columns.name] || '').trim();
      const maxCapacity = Number(projectData[columns.maxCapacity]) || 0;
      const currentCount = Number(projectData[columns.currentCount]) || 0;
      const approvedMembers = String(projectData[columns.members] || '').trim();

      if (!isUserAuthorized(userId, username, leaderTelegramId)) {
        answerCallbackQuery(callbackId, 'У вас нет права подтверждать эту заявку.', true);
        return;
      }

      if (currentCount >= maxCapacity) {
        answerCallbackQuery(callbackId, 'Нет свободных мест в проекте.', true);
        return;
      }

      const members = approvedMembers ? approvedMembers.split(',').map(v => String(v).trim()).filter(Boolean) : [];
      if (!members.includes(studentTelegramId)) {
        members.push(studentTelegramId);
      }

      project.sheet.getRange(projectRow + 1, columns.currentCount + 1).setValue(members.length);
      project.sheet.getRange(projectRow + 1, columns.members + 1).setValue(members.join(', '));
      joinSheet.getRange(requestRow + 1, 5).setValue('Approved');

      sendTelegramNotification(
        `✅ <b>Заявка ${requestId} принята!</b>\n` +
        `👤 Участник <b>@${esc(studentTelegramId)}</b> добавлен в команду <b>${esc(projectName)}</b>.`,
        TELEGRAM_TOPIC_REQUESTS
      );

      sendTelegramMessage(
        studentTelegramId,
        '✅ <b>Ваша заявка принята</b>\n\n' +
        'Проект: <b>' + esc(projectName) + '</b>\n' +
        'Статус: участник добавлен в команду.'
      );

      answerCallbackQuery(callbackId, '✅ Заявка подтверждена', false);
      if (tgMessage && tgMessage.chat && tgMessage.message_id) {
        const actor = username ? '@' + username : userId;
        editTelegramMessage(
          tgMessage.chat.id,
          tgMessage.message_id,
          (tgMessage.text || '') + '\n\n✅ <b>ПРИНЯТО</b> (Обработал: ' + esc(actor) + ')'
        );
      }
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    Logger.log('❌ Ошибка handleApproveRequest: ' + error.toString());
    answerCallbackQuery(callbackId, 'Ошибка при подтверждении', true);
  }
}

function handleRejectRequest(requestId, userId, username, callbackId, tgMessage) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) {
      answerCallbackQuery(callbackId, 'Операция занята.', true);
      return;
    }

    try {
      const joinSheet = ss.getSheetByName(SHEET_NAMES.joinRequests);
      const projectsSheet = ss.getSheetByName(SHEET_NAMES.studentProjects) || ss.getSheetByName(SHEET_NAMES.projects);

      if (!joinSheet || !projectsSheet) {
        answerCallbackQuery(callbackId, 'Таблицы не найдены.', true);
        return;
      }

      const joinData = joinSheet.getDataRange().getValues();

      let requestRow = -1;
      let projectId = '';
      let studentTelegramId = '';

      for (let i = 1; i < joinData.length; i++) {
        if (String(joinData[i][0]).trim() === String(requestId).trim()) {
          requestRow = i;
          projectId = String(joinData[i][1] || '').trim();
          studentTelegramId = String(joinData[i][2] || '').trim();
          break;
        }
      }

      if (requestRow === -1) {
        answerCallbackQuery(callbackId, 'Заявка не найдена.', true);
        return;
      }

      const requestStatus = String(joinData[requestRow][4] || '').trim().toLowerCase();
      if (requestStatus === 'approved' || requestStatus === 'rejected') {
        answerCallbackQuery(callbackId, 'Заявка уже обработана.', true);
        return;
      }

      const project = findProjectRowById(ss, projectId);
      const projectName = project
        ? String(project.values[project.row][project.columns.name] || '').trim()
        : '';
      const leaderTelegramId = project
        ? String(project.values[project.row][project.columns.leader] || '').trim()
        : '';

      if (!project || !isUserAuthorized(userId, username, leaderTelegramId)) {
        answerCallbackQuery(callbackId, 'У вас нет права отклонять эту заявку.', true);
        return;
      }

      joinSheet.getRange(requestRow + 1, 5).setValue('Rejected');

      sendTelegramMessage(
        studentTelegramId,
        '❌ <b>Ваша заявка отклонена</b>\n\n' +
        'Проект: <b>' + esc(projectName) + '</b>'
      );

      answerCallbackQuery(callbackId, '✅ Заявка отклонена', false);
      if (tgMessage && tgMessage.chat && tgMessage.message_id) {
        const actor = username ? '@' + username : userId;
        editTelegramMessage(
          tgMessage.chat.id,
          tgMessage.message_id,
          (tgMessage.text || '') + '\n\n❌ <b>ОТКЛОНЕНО</b> (Обработал: ' + esc(actor) + ')'
        );
      }
      sendTelegramNotification(
        `❌ Заявка <code>${esc(requestId)}</code> на проект <b>${esc(projectName)}</b> отклонена.`,
        TELEGRAM_TOPIC_REQUESTS
      );
    } finally {
      lock.releaseLock();
    }

  } catch (error) {
    Logger.log('❌ Ошибка handleRejectRequest: ' + error.toString());
  }
}

// ============================================================
// 3. Google Forms Submit & Parsing
// ============================================================

function onFormSubmit(e) {
  try {
    if (!e) return;
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) return;

    try {
      const sheetName = (e.range && e.range.getSheet) ? e.range.getSheet().getName() : '';
      const answers = parseFormAnswers(e);

      if (sheetName === 'Team' || sheetName.includes('Team')) {
        handleTeamFormSubmission(answers);
      } else if (sheetName === 'Проекты' || sheetName.includes('Проект')) {
        handleProjectCreationSubmission(answers, sheetName);
      } else if (sheetName === 'ADD HW' || sheetName.includes('HW')) {
        handleHomeworkSubmission(answers);
      }

      recalculateProjectCounts();
      updateFormProjectOptions();
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    Logger.log('❌ Ошибка в onFormSubmit: ' + err.toString());
  }
}

function parseFormAnswers(e) {
  const result = {
    project_id: '', project_name: '', team_name: '',
    student_name: '', student_tg: '', leader_tg: '', subject: '',
    task: '', deadline: '', max_capacity: '', points: '', link: ''
  };

  if (!e || !e.namedValues) return result;

  Object.keys(e.namedValues).forEach(key => {
    const k = key.toLowerCase().trim();
    const val = String(e.namedValues[key][0] || '').trim();

    if (k.includes('выберите проект') || k.includes('проект')) {
      const match = val.match(/(PRJ-\d+)/i);
      if (match) result.project_id = match[1].toUpperCase();
    }

    if (k.includes('команд') || k.includes('название команды') || k.includes('имя команды')) {
      result.team_name = val;
    }

    if (k.includes('предмет') || k.includes('дисциплина')) result.subject = val;
    if (k.includes('мест') || k.includes('capacity')) result.max_capacity = val;
    if (k.includes('дедлайн') || k.includes('срок')) result.deadline = val;
    if (k.includes('задание') || k.includes('описание')) result.task = val;
    if (k.includes('балл') || k.includes('кредит')) result.points = val;
    if (k.includes('ссылка') || k.includes('материал')) result.link = val;

    if (k.includes('telegram') || k.includes('username') || k.includes('id студента')) {
      const cleanTg = val.replace('@', '').trim();
      if (k.includes('лидер')) {
        result.leader_tg = cleanTg;
      } else {
        result.student_tg = cleanTg;
        result.leader_tg = cleanTg;
      }
    }
    if (k.includes('лидер') && !result.leader_tg) result.leader_tg = val.replace('@', '').trim();
    if (k.includes('имя') || k.includes('фио')) result.student_name = val;
  });

  return result;
}

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
  if (!sheetProjects) return;

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

function handleJoinRequestSubmission(answers) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const joinSheet = ss.getSheetByName('Join_Requests');
  const project = findProjectRowById(ss, answers.project_id);

  const matchedName = project ? project.teamName : answers.project_id;
  const matchedDeadline = project ? project.deadline : '';

  if (joinSheet) {
    const reqId = 'REQ-' + String(joinSheet.getLastRow()).padStart(3, '0');
    const createdAt = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
    const cleanTg = String(answers.student_tg || '').replace(/^@/, '').trim();

    joinSheet.appendRow([
      reqId,
      answers.project_id,
      cleanTg,
      answers.student_name || 'Участник',
      'Pending',
      createdAt,
      matchedDeadline
    ]);

    const notifyText =
      `📥 <b>НОВАЯ ЗАЯВКА С САЙТА!</b>\n\n` +
      `🆔 <b>ID Заявки:</b> <code>${reqId}</code>\n` +
      `📁 <b>Команда/Проект:</b> ${esc(matchedName)} (<code>${esc(answers.project_id)}</code>)\n` +
      `👤 <b>Заявитель:</b> ${esc(answers.student_name || 'Участник')}\n` +
      `💬 <b>Telegram:</b> @${esc(cleanTg)}`;

    const buttons = [[
      { text: '✅ Принять', callback_data: 'app_' + reqId },
      { text: '❌ Отклонить', callback_data: 'rej_' + reqId }
    ]];
    sendTelegramNotificationWithButtons(notifyText, TELEGRAM_TOPIC_REQUESTS, buttons);
  }
}

// ============================================================
// 4. Data Processing & Website Data
// ============================================================

function getProjectsForWebsite() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let targetSheet = ss.getSheetByName(SHEET_NAMES.studentProjects);
    if (!targetSheet || targetSheet.getLastRow() < 2) {
      targetSheet = ss.getSheetByName(SHEET_NAMES.projects);
    }
    if (!targetSheet) return [];

    const rows = targetSheet.getDataRange().getValues();
    const result = [];

    for (let i = 1; i < rows.length; i++) {
      if (!rows[i][0] && !rows[i][1]) continue;

      const firstCell = String(rows[i][0] || '').trim();
      if (firstCell.includes('.') && firstCell.includes(':')) continue;

      const status = String(rows[i][9] || rows[i][8] || 'Active').trim().toLowerCase();
      if (status === 'closed' || status === 'expired' || status === 'archived' || status === 'inactive') continue;

      const maxCapacity = Number(rows[i][4]) || Number(rows[i][3]) || 0;
      const currentCount = Number(rows[i][5]) || Number(rows[i][4]) || 0;

      result.push({
        projectId: String(rows[i][0] || '').trim(),
        projectName: String(rows[i][1] || '').trim(),
        subject: String(rows[i][2] || '').trim(),
        maxCapacity: maxCapacity,
        currentCount: currentCount,
        leaderTelegramId: String(rows[i][6] || rows[i][5] || '').trim(),
        approvedMembers: String(rows[i][7] || rows[i][6] || '').trim(),
        deadline: String(rows[i][8] || rows[i][7] || '').trim(),
        availableSpots: Math.max(0, maxCapacity - currentCount),
        status: status
      });
    }

    return result;
  } catch (error) {
    Logger.log('❌ Ошибка getProjectsForWebsite: ' + error.toString());
    return [];
  }
}

function processUserQuery(userMessage) {
  try {
    const query = String(userMessage || '').trim();
    if (!query) return '❓ Напишите вопрос, например: «Что задавали по математике?»';

    const normalized = query.toLowerCase();

    if (normalized.includes('проект') || normalized.includes('команда') || normalized.includes('группа')) {
      return findProjectsForTelegram();
    }
    if (normalized.includes('расписан') || normalized.includes('занят') || normalized.includes('когда')) {
      return findScheduleForTelegram();
    }
    if (
      normalized.includes('дз') || normalized.includes('домаш') ||
      normalized.includes('задан') || normalized.includes('дедлайн') || normalized.includes('по ')
    ) {
      return findHomeworkForTelegram(query);
    }

    return '❓ Я не понял ваш вопрос. Попробуйте: «Что задавали по математике?» или «Какие проекты есть?»';
  } catch (error) {
    return '❌ Не удалось обработать запрос.';
  }
}

function findHomeworkForTelegram(query) {
  try {
    const subject = extractSubjectFromQuery(query);
    const rows = [];

    const hwRows = getSheetData(SHEET_NAMES.homeworkPool);
    hwRows.forEach(row => {
      const rowSubject = String(row.Subject || '').trim();
      const status = String(row.Status || 'Active').trim().toLowerCase();

      if (status && status !== 'active') return;
      if (subject && rowSubject.toLowerCase().indexOf(subject.toLowerCase()) === -1) return;

      rows.push({
        subject: rowSubject,
        task: row.Task_Description || row.Task || '',
        date: row.Deadline_Date || row.Date || ''
      });
    });

    if (rows.length === 0) {
      return subject
        ? '📋 По предмету «' + esc(subject) + '» заданий не найдено.'
        : '📋 Заданий пока не найдено.';
    }

    let result = '📚 <b>Найдены задания:</b>\n\n';
    rows.slice(0, 10).forEach((r, index) => {
      result += (index + 1) + '. <b>[' + esc(r.subject || 'Без предмета') + ']</b>: ' + esc(r.task || 'Без текста');
      if (r.date) result += ' — <i>' + esc(r.date) + '</i>';
      result += '\n';
    });

    return result;
  } catch (error) {
    return '❌ Не удалось прочитать данные из таблицы.';
  }
}

function findScheduleForTelegram() {
  try {
    const rows = getSheetData(SHEET_NAMES.schedule);
    if (!rows.length) return '📅 Расписание пока не найдено.';

    let result = '📅 <b>Расписание:</b>\n\n';
    rows.slice(0, 15).forEach((r, index) => {
      result += (index + 1) + '. <b>' + esc(r.Day || 'День') + '</b> — ' + esc(r.Subject || 'Предмет') + ' (' + esc(r.Time || 'Время') + ')\n';
    });

    return result;
  } catch (error) {
    return '❌ Не удалось прочитать расписание.';
  }
}

function findProjectsForTelegram() {
  try {
    const rows = getProjectsForWebsite();
    if (!rows.length) return '📦 Активных проектов пока нет.';

    let result = '📦 <b>Активные команды:</b>\n\n';
    rows.slice(0, 10).forEach((row, index) => {
      result += (index + 1) + '. <b>' + esc(row.projectName || 'Без названия') + '</b>\n';
      result += '   📚 ' + esc(row.subject || 'Предмет') + '\n';
      result += '   👑 Лидер: @' + esc(row.leaderTelegramId) + '\n';
      result += '   👥 Свободно: ' + row.availableSpots + '/' + row.maxCapacity + '\n\n';
    });

    return result;
  } catch (error) {
    return '❌ Не удалось прочитать проекты.';
  }
}

function extractSubjectFromQuery(query) {
  try {
    const text = String(query || '').toLowerCase();
    const match = text.match(/по\s+([а-яёa-z0-9\-_ ]+)/i);
    if (!match) return '';
    return match[1].trim().replace(/\s+(что|задали|задавали|домашка|дз|сегодня|сейчас)$/i, '');
  } catch (error) {
    return '';
  }
}

function generateNextProjectId(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 'PRJ-001';

  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  let maxNum = 0;

  ids.forEach(row => {
    const match = String(row[0]).match(/PRJ-(\d+)/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  });

  return 'PRJ-' + String(maxNum + 1).padStart(3, '0');
}

function getSheetData(sheetName) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(h => String(h).trim());
  const rows = [];

  for (let i = 1; i < values.length; i++) {
    if (values[i].every(c => c === '' || c === null || c === undefined)) continue;

    const obj = {};
    headers.forEach((header, idx) => {
      let value = values[i][idx];
      if (value instanceof Date) {
        value = Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      }
      obj[header] = value;
    });
    rows.push(obj);
  }

  return rows;
}

function getDeadlinesForWebsite() {
  let deadlines = getSheetData(SHEET_NAMES.deadlines);
  if (!deadlines || deadlines.length === 0) {
    deadlines = getSheetData(SHEET_NAMES.homeworkPool);
  }
  return deadlines;
}

function recalculateProjectCounts() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const projSheet = ss.getSheetByName(SHEET_NAMES.studentProjects) || ss.getSheetByName(SHEET_NAMES.projects);
    const reqSheet = ss.getSheetByName(SHEET_NAMES.joinRequests);

    if (!projSheet || !reqSheet) return;

    const projData = projSheet.getDataRange().getValues();
    const reqData = reqSheet.getDataRange().getValues();

    if (projData.length < 2) return;

    const counts = {};
    for (let i = 1; i < reqData.length; i++) {
      const pId = String(reqData[i][1] || '').trim();
      const status = String(reqData[i][4] || '').trim();
      if (pId && status === 'Approved') {
        counts[pId] = (counts[pId] || 0) + 1;
      }
    }

    const colCount = projSheet.getName() === SHEET_NAMES.studentProjects ? 6 : 5;

    for (let i = 1; i < projData.length; i++) {
      const pId = String(projData[i][0]).trim();
      if (pId) {
        const approvedCount = (counts[pId] || 0) + 1;
        projSheet.getRange(i + 1, colCount).setValue(approvedCount);
      }
    }

    SpreadsheetApp.flush();
  } catch (error) {
    Logger.log('❌ Ошибка в recalculateProjectCounts: ' + error.toString());
  }
}

function updateFormProjectOptions() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const projSheet = ss.getSheetByName(SHEET_NAMES.projects);
    if (!projSheet) return;

    const data = projSheet.getDataRange().getValues();
    if (data.length < 2) return;

    const activeProjects = [];
    for (let i = 1; i < data.length; i++) {
      const pId = String(data[i][0]).trim();
      const name = String(data[i][1]).trim();
      const maxCap = Number(data[i][3]) || 0;
      const curCount = Number(data[i][4]) || 0;
      const status = String(data[i][8] || 'Active').trim();

      if (name && status === 'Active' && curCount < maxCap) {
        activeProjects.push(`${name} (${pId})`);
      }
    }

    const form = FormApp.openById(CONFIG.TEAM_FORM_ID);
    const items = form.getItems();

    for (let i = 0; i < items.length; i++) {
      if (items[i].getTitle() === CONFIG.PROJECT_QUESTION_TITLE) {
        const listItem = items[i].asListItem();
        listItem.setChoiceValues(activeProjects.length > 0 ? activeProjects : ['Нет доступных проектов']);
        break;
      }
    }
  } catch (error) {
    Logger.log('❌ Ошибка updateFormProjectOptions: ' + error.toString());
  }
}

// ============================================================
// 5. Telegram API Utilities
// ============================================================

function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function sendTelegramMessage(chatId, text) {
  UrlFetchApp.fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/sendMessage', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: String(chatId), text: text, parse_mode: 'HTML' }),
    muteHttpExceptions: true
  });
}

function editTelegramMessage(chatId, messageId, text) {
  UrlFetchApp.fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/editMessageText', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      chat_id: String(chatId),
      message_id: messageId,
      text: text,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [] }
    }),
    muteHttpExceptions: true
  });
}

function answerCallbackQuery(callbackId, text, showAlert) {
  UrlFetchApp.fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/answerCallbackQuery', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ callback_query_id: callbackId, text: text, show_alert: !!showAlert }),
    muteHttpExceptions: true
  });
}

function sendTelegramNotification(text, topicId = null) {
  const payload = {
    chat_id: TELEGRAM_CHAT_ID,
    text: text,
    parse_mode: 'HTML'
  };
  if (topicId) payload.message_thread_id = Number(topicId);

  UrlFetchApp.fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/sendMessage', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

function sendTelegramNotificationWithButtons(text, topicId, buttons) {
  const payload = {
    chat_id: TELEGRAM_CHAT_ID,
    text: text,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: buttons }
  };
  if (topicId) payload.message_thread_id = Number(topicId);

  UrlFetchApp.fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/sendMessage', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}
