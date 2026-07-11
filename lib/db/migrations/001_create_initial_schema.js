/**
 * Migration: Create Initial Schema (Updated from DB Diagram)
 * - All core tables for the chat application matched with the true schema.
 * * Run:  npx knex migrate:latest
 * Undo: npx knex migrate:rollback
 */

export async function up(knex) {
  // ==========================================
  // 1. PAYS (COUNTRIES) TABLE
  // ==========================================
  await knex.schema.createTable('pays', (table) => {
    table.increments('idPays').primary();
    table.string('libelle', 100).notNullable().unique();
    table.string('prefix', 10).notNullable().unique();
    table.string('timeZone', 50).notNullable();
    table.integer('decalageHoraire').notNullable();
    table.timestamp('createdAt').defaultTo(knex.fn.now());
  });

  // ==========================================
  // 2. USERS TABLE
  // ==========================================
  await knex.schema.createTable('users', (table) => {
    table.increments('alanyaID').primary();
    table.string('nom', 100);
    table.string('pseudo', 80);
    table.string('alanyaPhone', 9);
    table.integer('idPays').unsigned();
    table.string('password', 255);
    table.string('avatar_url', 255);
    table.smallint('type_compte');
    table.tinyint('is_online', 1).unsigned();
    table.datetime('last_seen');
    table.tinyint('exclus', 1).unsigned();
    table.tinyint('in_call', 1).unsigned();
    table.tinyint('biometric', 1).unsigned();
    table.string('fcm_token', 255);
    table.string('device_ID', 255);
    table.timestamp('created_at').defaultTo(knex.fn.now());

    // Foreign key
    table.foreign('idPays').references('idPays').inTable('pays');

    // Indexes
    table.index('alanyaPhone', 'idx_users_phone');
    table.index('created_at', 'idx_users_created');
  });

  // ==========================================
  // 3. USER ACCESS LOGS TABLE
  // ==========================================
  await knex.schema.createTable('userAccess', (table) => {
    table.increments('idLog').primary();
    table.integer('alanyaID').unsigned().notNullable();
    table.string('device', 255);
    table.string('ipAddress', 45);
    table.string('os_system', 100);
    table.timestamp('createdAt').defaultTo(knex.fn.now());

    table.foreign('alanyaID').references('alanyaID').inTable('users').onDelete('CASCADE');
  });

  // ==========================================
  // 4. PREFERRED CONTACTS TABLE
  // ==========================================
  await knex.schema.createTable('preferredContact', (table) => {
    table.increments('idPrefContact').primary();
    table.integer('alanyaID').unsigned().notNullable();
    table.integer('idFriend').unsigned().notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.foreign('alanyaID').references('alanyaID').inTable('users').onDelete('CASCADE');
    table.foreign('idFriend').references('alanyaID').inTable('users').onDelete('CASCADE');
    table.unique(['alanyaID', 'idFriend']);
  });

  // ==========================================
  // 5. CONVERSATION TABLE
  // ==========================================
  await knex.schema.createTable('conversation', (table) => {
    table.increments('conversationId').primary();
    table.integer('idGroup');
    table.string('groupName', 255).notNullable();
    table.string('groupPhoto', 255);
    table.longText('lastMessage');
    table.integer('lastMessageSenderId').unsigned();
    table.string('lastMessageType', 20);
    table.string('lastMessageStatus', 20);
    table.timestamp('lastMessageAt');
    table.timestamp('createdAt').defaultTo(knex.fn.now());

    table.foreign('lastMessageSenderId').references('alanyaID').inTable('users').onDelete('SET NULL');
    table.index('idGroup', 'idx_conversation_idGroup');
  });

  // ==========================================
  // 6. CONVERSATION PARTICIPANTS TABLE
  // ==========================================
  await knex.schema.createTable('conv_participants', (table) => {
    table.increments('id').primary();
    table.integer('conversationId').unsigned().notNullable();
    table.integer('alanyaID').unsigned().notNullable();
    table.integer('unreadCount').notNullable().defaultTo(0);
    table.tinyint('isPinned', 1).notNullable().defaultTo(0);
    table.tinyint('isThread', 1).notNullable().defaultTo(0);
    table.tinyint('isArchived', 1).notNullable().defaultTo(0);
    table.timestamp('joinedAt').defaultTo(knex.fn.now());

    table.foreign('conversationId').references('conversationId').inTable('conversation').onDelete('CASCADE');
    table.foreign('alanyaID').references('alanyaID').inTable('users').onDelete('CASCADE');
    table.unique(['conversationId', 'alanyaID']);
  });

  // ==========================================
  // 7. MESSAGES TABLE
  // ==========================================
  await knex.schema.createTable('messages', (table) => {
    table.increments('messageId').primary();
    table.integer('senderId').unsigned().notNullable();
    table.integer('conversationId').unsigned().notNullable();
    table.longText('content').notNullable();
    table.string('type', 20).notNullable().defaultTo('text');
    table.string('status', 20).notNullable().defaultTo('pending');
    table.timestamp('sentAt').defaultTo(knex.fn.now());
    table.datetime('readAt');
    table.string('mediaUrl', 255);
    table.string('mediaName', 255);
    table.integer('mediaDuration');
    table.tinyint('isDeleted', 1).notNullable().defaultTo(0);
    table.datetime('deletedAt');
    table.integer('deletedForId').unsigned();
    table.datetime('editedAt');
    table.integer('forwardedFrom').unsigned();
    table.integer('replyToId').unsigned();
    table.longText('replyToContent');
    table.tinyint('isStatusReply', 1).defaultTo(0);

    table.foreign('senderId').references('alanyaID').inTable('users').onDelete('CASCADE');
    table.foreign('conversationId').references('conversationId').inTable('conversation').onDelete('CASCADE');
    table.foreign('replyToId').references('messageId').inTable('messages').onDelete('SET NULL');
    table.foreign('deletedForId').references('alanyaID').inTable('users').onDelete('SET NULL');

    table.index('conversationId', 'idx_messages_conv');
  });

  // ==========================================
  // 8. STATUS (STORIES) TABLE
  // ==========================================
  await knex.schema.createTable('status', (table) => {
    table.increments('statusId').primary();
    table.integer('userId').unsigned().notNullable();
    table.string('type', 20).defaultTo('image');
    table.longText('text');
    table.string('contentUrl', 255);
    table.string('backgroundColor', 30);
    table.timestamp('createdAt').defaultTo(knex.fn.now());
    table.timestamp('expiresAt');
    table.string('viewedBy', 255);

    table.foreign('userId').references('alanyaID').inTable('users').onDelete('CASCADE');
  });

  // ==========================================
  // 9. STATUS VIEWERS TABLE
  // ==========================================
  await knex.schema.createTable('statusViewer', (table) => {
    table.increments('id').primary();
    table.integer('statusId').unsigned().notNullable();
    table.integer('viewerId').unsigned().notNullable();
    table.timestamp('viewedAt').defaultTo(knex.fn.now());

    table.foreign('statusId').references('statusId').inTable('status').onDelete('CASCADE');
    table.foreign('viewerId').references('alanyaID').inTable('users').onDelete('CASCADE');
    table.unique(['statusId', 'viewerId']);
  });

  // ==========================================
  // 10. BLOCKED USERS TABLE
  // ==========================================
  await knex.schema.createTable('blocked', (table) => {
    table.increments('idBlock').primary();
    table.integer('alanyaID').unsigned().notNullable();
    table.integer('idCallerBlock').unsigned().notNullable();
    table.timestamp('dateBlock').defaultTo(knex.fn.now());

    table.foreign('alanyaID').references('alanyaID').inTable('users').onDelete('CASCADE');
    table.foreign('idCallerBlock').references('alanyaID').inTable('users').onDelete('CASCADE');
    table.unique(['alanyaID', 'idCallerBlock']);
  });

  // ==========================================
  // 11. CALL HISTORY TABLE
  // ==========================================
  await knex.schema.createTable('callHistory', (table) => {
    table.increments('callId').primary();
    table.integer('idCaller').unsigned().notNullable();
    table.integer('idReceiver').unsigned().notNullable();
    table.string('status', 20).defaultTo('pending');
    table.string('type', 20).defaultTo('voice');
    table.timestamp('start_time').defaultTo(knex.fn.now());
    table.integer('duree');

    table.foreign('idCaller').references('alanyaID').inTable('users').onDelete('CASCADE');
    table.foreign('idReceiver').references('alanyaID').inTable('users').onDelete('CASCADE');
  });

  // ==========================================
  // 12. MEETINGS TABLE
  // ==========================================
  await knex.schema.createTable('meeting', (table) => {
    table.increments('idMeeting').primary();
    table.integer('idOrganiser').unsigned().notNullable();
    table.timestamp('start_time').defaultTo(knex.fn.now());
    table.integer('duree');
    table.string('objet', 255);
    table.string('room', 100);
    table.timestamp('End');
    table.string('type_media', 20);

    table.foreign('idOrganiser').references('alanyaID').inTable('users').onDelete('CASCADE');
  });

  // ==========================================
  // 13. MEETING PARTICIPANTS TABLE
  // ==========================================
  await knex.schema.createTable('participant', (table) => {
    table.increments('id').primary();
    table.integer('idMeeting').unsigned().notNullable();
    table.integer('idParticipant').unsigned().notNullable();
    table.string('status', 50);
    table.timestamp('start_time');
    table.timestamp('connecte');
    table.integer('duree');

    table.foreign('idMeeting').references('idMeeting').inTable('meeting').onDelete('CASCADE');
    table.foreign('idParticipant').references('alanyaID').inTable('users').onDelete('CASCADE');
    table.unique(['idMeeting', 'idParticipant']);
  });

  console.log('✅ Created all true schema tables successfully');
}

export async function down(knex) {
  // Drop tables in strict reverse order of dependencies
}