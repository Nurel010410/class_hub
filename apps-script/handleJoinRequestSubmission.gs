// Replace the existing handleJoinRequestSubmission() in code.js with this version.
// It uses the column map returned by findProjectRowById(), so it works for both
// Student_Projects and Projects without relying on nonexistent object properties.
function handleJoinRequestSubmission(answers) {
  const input = answers || {};
  const projectId = String(input.project_id || input.projectId || '').trim();
  const studentName = String(input.student_name || input.studentName || 'Участник').trim();
  const cleanTg = String(input.student_tg || input.studentTg || input.telegram || '')
    .replace(/^@/, '')
    .trim();

  if (!projectId || !cleanTg) {
    Logger.log('❌ Заявка отклонена: project_id и student_tg обязательны');
    return { ok: false, error: 'project_id и student_tg обязательны' };
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const joinSheet = ss.getSheetByName(SHEET_NAMES.joinRequests);
  if (!joinSheet) {
    Logger.log('❌ Лист Join_Requests не найден');
    return { ok: false, error: 'Лист Join_Requests не найден' };
  }

  const project = findProjectRowById(ss, projectId);
  if (!project) {
    Logger.log('❌ Проект не найден: ' + projectId);
    return { ok: false, error: 'Проект не найден' };
  }

  const row = project.values[project.row];
  const columns = project.columns;
  const projectName = String(row[columns.name] || projectId).trim();
  const deadlineValue = row[columns.deadline];
  const matchedDeadline = deadlineValue instanceof Date
    ? Utilities.formatDate(deadlineValue, Session.getScriptTimeZone(), 'dd.MM.yyyy')
    : String(deadlineValue || '').trim();

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { ok: false, error: 'Операция занята, попробуйте позже' };
  }

  try {
    const lastRow = joinSheet.getLastRow();
    const existing = lastRow > 1
      ? joinSheet.getRange(2, 1, lastRow - 1, 7).getValues()
      : [];

    // Не создаём дубликат активной заявки одного пользователя в ту же команду.
    const duplicate = existing.some(request =>
      String(request[1] || '').trim().toLowerCase() === projectId.toLowerCase() &&
      String(request[2] || '').replace(/^@/, '').trim().toLowerCase() === cleanTg.toLowerCase() &&
      !['approved', 'rejected'].includes(String(request[4] || '').trim().toLowerCase())
    );
    if (duplicate) {
      return { ok: false, error: 'Такая заявка уже существует' };
    }

    const reqId = 'REQ-' + String(Math.max(1, joinSheet.getLastRow())).padStart(3, '0');
    const createdAt = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');

    joinSheet.appendRow([
      reqId,
      projectId,
      cleanTg,
      studentName || 'Участник',
      'Pending',
      createdAt,
      matchedDeadline
    ]);

    const notifyText =
      '📥 <b>НОВАЯ ЗАЯВКА С САЙТА!</b>\n\n' +
      '🆔 <b>ID заявки:</b> <code>' + esc(reqId) + '</code>\n' +
      '📁 <b>Команда/проект:</b> ' + esc(projectName) + ' (<code>' + esc(projectId) + '</code>)\n' +
      '👤 <b>Заявитель:</b> ' + esc(studentName || 'Участник') + '\n' +
      '💬 <b>Telegram:</b> @' + esc(cleanTg);

    sendTelegramNotificationWithButtons(notifyText, TELEGRAM_TOPIC_REQUESTS, [[
      { text: '✅ Принять', callback_data: 'app_' + reqId },
      { text: '❌ Отклонить', callback_data: 'rej_' + reqId }
    ]]);

    return { ok: true, requestId: reqId };
  } finally {
    lock.releaseLock();
  }
}
