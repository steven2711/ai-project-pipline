# Task Management API

## Overview

A RESTful API for task management with user authentication, designed for individual users and small teams to track their daily tasks and project workflows.

## Vision Statement

Provide a simple, fast, and reliable API for managing tasks with support for user authentication, task assignment, priority levels, and due date tracking.

## Tech Stack

- Backend: Node.js with Express
- Database: PostgreSQL
- Testing: Jest with Supertest
- Deployment: Docker and Docker Compose

## Features

### User Authentication

Implement secure user registration and login using JWT tokens. Users should be able to sign up with email and password, log in to receive an access token, and use that token for authenticated requests.

**Requirements**:
- Email and password validation
- Secure password hashing with bcrypt
- JWT token generation and verification
- Token expiration handling (24-hour tokens)

### Task CRUD Operations

Users should be able to create, read, update, and delete their tasks. Each task includes a title, description, status, priority level, and optional due date.

**Requirements**:
- Create new tasks with validation
- List all tasks for the authenticated user
- Filter tasks by status (pending, in-progress, completed)
- Update task details
- Delete tasks
- Soft delete support (mark as deleted, not permanently remove)

### Task Assignment

Allow users to assign tasks to other users within their workspace. Assigned users should be able to see tasks assigned to them.

**Requirements**:
- Assign task to user by user ID
- List tasks assigned to current user
- Reassign tasks to different users
- Notification when task is assigned (future enhancement)

### Due Date Tracking

Tasks can have optional due dates. The system should track overdue tasks and provide endpoints to query tasks by due date ranges.

**Requirements**:
- Add due date to tasks (optional field)
- Query tasks that are overdue
- Query tasks due within a specific date range
- Sort tasks by due date

### Priority Management

Tasks can be assigned priority levels (low, medium, high, urgent). Users should be able to filter and sort by priority.

**Requirements**:
- Set priority when creating/updating tasks
- Filter tasks by priority level
- Sort task lists by priority
- Default priority to "medium" if not specified

## Non-Functional Requirements

### Security
- All passwords must be hashed
- API endpoints (except auth) require valid JWT
- Input validation on all endpoints
- Rate limiting on authentication endpoints

### Performance
- API response time < 200ms for standard queries
- Support for pagination on list endpoints
- Database indexes on frequently queried fields

### Testing
- 80%+ code coverage
- Integration tests for all API endpoints
- Unit tests for business logic
- Test fixtures for consistent test data
