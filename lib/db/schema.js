// Database schema - All table definitions

export const schema = `
  -- PAYS (COUNTRIES) TABLE
  CREATE TABLE IF NOT EXISTS pays (
    idPays INT PRIMARY KEY AUTO_INCREMENT,
    libelle VARCHAR(100) NOT NULL UNIQUE,
    prefix VARCHAR(10) NOT NULL UNIQUE,
    timeZone VARCHAR(50) NOT NULL,
    decalageHoraire INT NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- USERS TABLE
  CREATE TABLE IF NOT EXISTS users (
    alanyaID INT PRIMARY KEY AUTO_INCREMENT,
    nom VARCHAR(100),
    pseudo VARCHAR(80),
    alanyaPhone VARCHAR(9),
    idPays SMALLINT UNSIGNED,
    password VARCHAR(255),
    avatar_url VARCHAR(255),
    type_compte SMALLINT,
    is_online TINYINT UNSIGNED,
    last_seen DATETIME,
    exclus TINYINT UNSIGNED,
    in_call TINYINT UNSIGNED,
    biometric TINYINT UNSIGNED,
    fcm_token VARCHAR(255),
    device_ID VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (idPays) REFERENCES pays(idPays),
    INDEX idx_users_phone (alanyaPhone),
    INDEX idx_users_created (created_at)
  );

  -- CONVERSATION TABLE
  CREATE TABLE IF NOT EXISTS conversation (
    conversationId INT PRIMARY KEY AUTO_INCREMENT,
    idGroup INT,
    groupName VARCHAR(255) NOT NULL,
    groupPhoto VARCHAR(255),
    lastMessage LONGTEXT,
    lastMessageSenderId INT,
    lastMessageType VARCHAR(20),
    lastMessageStatus VARCHAR(20),
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_conversation_idGroup (idGroup)
  );

  -- CONVERSATION PARTICIPANTS TABLE
  CREATE TABLE IF NOT EXISTS conv_participants (
    id INT PRIMARY KEY AUTO_INCREMENT,
    conversationId INT NOT NULL,
    alanyaID INT NOT NULL,
    unreadCount INT NOT NULL DEFAULT 0,
    isThread TINYINT NOT NULL DEFAULT 0,
    isArchived TINYINT NOT NULL DEFAULT 0,
    joinedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversationId) REFERENCES conversation(conversationId) ON DELETE CASCADE,
    FOREIGN KEY (alanyaID) REFERENCES users(alanyaID) ON DELETE CASCADE,
    UNIQUE(conversationId, alanyaID),
    INDEX idx_conv_part_user (alanyaID)
  );

  -- MESSAGES TABLE
  CREATE TABLE IF NOT EXISTS messages (
    messageId INT PRIMARY KEY AUTO_INCREMENT,
    senderId INT NOT NULL,
    conversationId INT NOT NULL,
    content LONGTEXT NOT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'text',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    sentAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    readAt DATETIME,
    mediaUrl VARCHAR(255),
    mediaName VARCHAR(255),
    mediaDuration INT,
    isDeleted TINYINT NOT NULL DEFAULT 0,
    deletedAt DATETIME,
    deletedForId INT,
    editedAt DATETIME,
    forwardedFrom INT,
    replyToId INT,
    replyToContent LONGTEXT,
    FOREIGN KEY (senderId) REFERENCES users(alanyaID) ON DELETE CASCADE,
    FOREIGN KEY (conversationId) REFERENCES conversation(conversationId) ON DELETE CASCADE,
    FOREIGN KEY (replyToId) REFERENCES messages(messageId) ON DELETE SET NULL,
    INDEX idx_messages_conv (conversationId),
    INDEX idx_messages_sender (senderId),
    INDEX idx_messages_status (status),
    INDEX idx_messages_sentAt (sentAt DESC)
  );

  -- MESSAGE READ RECEIPTS TABLE
  CREATE TABLE IF NOT EXISTS messageReadReceipts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    messageId INT NOT NULL,
    alanyaID INT NOT NULL,
    readAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (messageId) REFERENCES messages(messageId) ON DELETE CASCADE,
    FOREIGN KEY (alanyaID) REFERENCES users(alanyaID) ON DELETE CASCADE,
    UNIQUE(messageId, alanyaID),
    INDEX idx_msg_read_msg (messageId),
    INDEX idx_msg_read_user (alanyaID)
  );

  -- STATUS (STORIES) TABLE
  CREATE TABLE IF NOT EXISTS status (
    statusId INT PRIMARY KEY AUTO_INCREMENT,
    alanyaID INT NOT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'text',
    text LONGTEXT,
    mediaUrl VARCHAR(255),
    backgroundColor VARCHAR(20) DEFAULT '#ffffff',
    visibility VARCHAR(20) DEFAULT 'public',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    expiresAt DATETIME NOT NULL,
    FOREIGN KEY (alanyaID) REFERENCES users(alanyaID) ON DELETE CASCADE,
    INDEX idx_status_user (alanyaID),
    INDEX idx_status_expires (expiresAt)
  );

  -- STATUS VIEWER TABLE
  CREATE TABLE IF NOT EXISTS statusViewer (
    id INT PRIMARY KEY AUTO_INCREMENT,
    statusId INT NOT NULL,
    viewerId INT NOT NULL,
    viewedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (statusId) REFERENCES status(statusId) ON DELETE CASCADE,
    FOREIGN KEY (viewerId) REFERENCES users(alanyaID) ON DELETE CASCADE,
    UNIQUE(statusId, viewerId),
    INDEX idx_status_viewer_status (statusId),
    INDEX idx_status_viewer_user (viewerId)
  );

  -- STATUS HIDDEN FROM TABLE
  CREATE TABLE IF NOT EXISTS statusHiddenFrom (
    id INT PRIMARY KEY AUTO_INCREMENT,
    statusId INT NOT NULL,
    hiddenFromId INT NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (statusId) REFERENCES status(statusId) ON DELETE CASCADE,
    FOREIGN KEY (hiddenFromId) REFERENCES users(alanyaID) ON DELETE CASCADE,
    UNIQUE(statusId, hiddenFromId),
    INDEX idx_status_hidden_status (statusId)
  );

  -- STATUS REPORT TABLE
  CREATE TABLE IF NOT EXISTS statusReport (
    id INT PRIMARY KEY AUTO_INCREMENT,
    statusId INT NOT NULL,
    reporterId INT NOT NULL,
    reason VARCHAR(255) NOT NULL,
    description LONGTEXT,
    reportedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (statusId) REFERENCES status(statusId) ON DELETE CASCADE,
    FOREIGN KEY (reporterId) REFERENCES users(alanyaID) ON DELETE CASCADE,
    INDEX idx_status_report_status (statusId),
    INDEX idx_status_report_reporter (reporterId)
  );

  -- PREFERRED CONTACTS TABLE
  CREATE TABLE IF NOT EXISTS preferredContact (
    idPrefContact INT PRIMARY KEY AUTO_INCREMENT,
    alanyaID INT NOT NULL,
    idFriend INT NOT NULL,
    addedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (alanyaID) REFERENCES users(alanyaID) ON DELETE CASCADE,
    FOREIGN KEY (idFriend) REFERENCES users(alanyaID) ON DELETE CASCADE,
    UNIQUE(alanyaID, idFriend),
    INDEX idx_pref_contact_user (alanyaID),
    INDEX idx_pref_contact_friend (idFriend)
  );

  -- BLOCKED USERS TABLE
  CREATE TABLE IF NOT EXISTS blocked (
    idBlock INT PRIMARY KEY AUTO_INCREMENT,
    alanyaID INT NOT NULL,
    idCallerBlock INT NOT NULL,
    reason TEXT,
    blockedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (alanyaID) REFERENCES users(alanyaID) ON DELETE CASCADE,
    FOREIGN KEY (idCallerBlock) REFERENCES users(alanyaID) ON DELETE CASCADE,
    UNIQUE(alanyaID, idCallerBlock),
    INDEX idx_blocked_user (alanyaID)
  );

  -- MEETING TABLE
  CREATE TABLE IF NOT EXISTS meeting (
    idMeeting INT PRIMARY KEY AUTO_INCREMENT,
    idOrganiser INT NOT NULL,
    startTime DATETIME NOT NULL,
    duree INT NOT NULL DEFAULT 0,
    objet VARCHAR(255) NOT NULL,
    room VARCHAR(255) NOT NULL,
    typeMedia VARCHAR(20) NOT NULL DEFAULT 'audio',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (idOrganiser) REFERENCES users(alanyaID) ON DELETE CASCADE,
    INDEX idx_meeting_organiser (idOrganiser),
    INDEX idx_meeting_startTime (startTime DESC)
  );

  -- MEETING PARTICIPANTS TABLE
  CREATE TABLE IF NOT EXISTS participant (
    id INT PRIMARY KEY AUTO_INCREMENT,
    idMeeting INT NOT NULL,
    alanyaID INT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    connecte TINYINT NOT NULL DEFAULT 0,
    duree INT NOT NULL DEFAULT 0,
    FOREIGN KEY (idMeeting) REFERENCES meeting(idMeeting) ON DELETE CASCADE,
    FOREIGN KEY (alanyaID) REFERENCES users(alanyaID) ON DELETE CASCADE,
    UNIQUE(idMeeting, alanyaID),
    INDEX idx_participant_meeting (idMeeting),
    INDEX idx_participant_user (alanyaID)
  );

  -- CALL HISTORY TABLE
  CREATE TABLE IF NOT EXISTS callHistory (
    idCall INT PRIMARY KEY AUTO_INCREMENT,
    idCaller INT NOT NULL,
    idReceiver INT NOT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'audio',
    status VARCHAR(20) NOT NULL DEFAULT 'missed',
    startTime DATETIME NOT NULL,
    duree INT NOT NULL DEFAULT 0,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (idCaller) REFERENCES users(alanyaID) ON DELETE CASCADE,
    FOREIGN KEY (idReceiver) REFERENCES users(alanyaID) ON DELETE CASCADE,
    INDEX idx_callhist_caller (idCaller),
    INDEX idx_callhist_receiver (idReceiver),
    INDEX idx_callhist_date (createdAt DESC),
    INDEX idx_callhist_type (type)
  );

  -- USER ACCESS LOGS TABLE
  CREATE TABLE IF NOT EXISTS userAccess (
    idLogin INT PRIMARY KEY AUTO_INCREMENT,
    alanyaID INT NOT NULL,
    device VARCHAR(100) NOT NULL,
    ipAddress VARCHAR(45) NOT NULL,
    osSystem VARCHAR(50) NOT NULL,
    dateLogin DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (alanyaID) REFERENCES users(alanyaID) ON DELETE CASCADE,
    INDEX idx_useraccess_user (alanyaID),
    INDEX idx_useraccess_date (dateLogin DESC)
  );
`;

export default schema;