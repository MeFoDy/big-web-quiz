/**
*
* Copyright 2016 Google Inc. All rights reserved.
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*     http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/
import {Question, Quiz} from './models';
import {User} from '../user/models';
import {longPollers} from '../long-pollers/views';
import EventStream from '../event-stream';

export const quiz = new Quiz();
export const presentationListeners = new EventStream();
longPollers.broadcast(quiz.getState());
presentationListeners.broadcast(quiz.getState());


export function adminStateJson(req, res) {
  Question.find().then(questions => {
    questions = questions.map(q => q.toObject());
    for (const question of questions) {
      question.active = quiz.activeQuestion && quiz.activeQuestion._id.equals(question._id);
      if (question.active) {
        question.closed = !quiz.acceptingAnswers;
        question.revealingAnswers = quiz.revealingAnswers;
      }
    }
    res.json({
      questions,
      showingLeaderboard: quiz.showingLeaderboard
    });
  });
}

export function deleteQuestionJson(req, res) {
  Question.findByIdAndRemove(req.body.id).then(() => {
    adminStateJson(req, res);
    return;
  }).catch(err => {
    res.status(500).json({err: err.message});
  });
}

export function updateQuestionJson(req, res) {
  const update = {
    text: req.body.text,
    code: req.body.code,
    codeType: req.body.codeType,
    multiple: !!req.body.multiple,
    scored: !!req.body.scored,
    answers: req.body.answers
  };

  if (!Array.isArray(update.answers)) {
    update.answers = [];
  }

  // remove answers without text
  update.answers = update.answers.filter(answer => String(answer.text).trim());

  if (!update.answers.length) {
    res.json({err: "No answers provided"});
    return;
  }

  let p;

  if (req.body.id) {
    p = Question.findByIdAndUpdate(req.body.id, update, {new: true});
  }
  else {
    p = new Question(update).save();
  }

  p.then(newQuestion => {
    if (!newQuestion) throw Error('No record found');
    adminStateJson(req, res);
    return;
  }).catch(err => {
    res.status(500).json({err: err.message});
  });
}

export function setQuestionJson(req, res) {
  Question.findById(req.body.id).then(question => {
    if (!question) {
      res.status(404).json({err: "Question not found"});
      return;
    }

    quiz.setQuestion(question);
    presentationListeners.broadcast(quiz.getState());
    longPollers.broadcast(quiz.getState());

    adminStateJson(req, res);
  }).catch(err => {
    res.status(500).json({err: err.message});
  });
}

export function closeQuestionJson(req, res) {
  Question.findById(req.body.id).then(question => {
    if (!question) {
      res.status(404).json({err: "Question not found"});
      return;
    }

    if (!quiz.activeQuestion || !question.equals(quiz.activeQuestion)) {
      res.status(404).json({err: "This isn't the active question"});
      return;
    }

    quiz.closeForAnswers();
    presentationListeners.broadcast(quiz.getState());
    longPollers.broadcast(quiz.getState());

    adminStateJson(req, res);
  }).catch(err => {
    res.status(500).json({err: err.message});
  });
}

export function revealQuestionJson(req, res) {
  Question.findById(req.body.id).then(question => {
    if (!question) {
      res.status(404).json({err: "Question not found"});
      return;
    }

    if (!quiz.activeQuestion || !question.equals(quiz.activeQuestion)) {
      res.status(404).json({err: "This isn't the active question"});
      return;
    }

    quiz.revealAnswers();

    return Question.find();
  }).then(qs => User.updateScores(qs)).then(() => {
    longPollers.broadcast(quiz.getState());
    presentationListeners.broadcast(quiz.getState());
    adminStateJson(req, res);
  }).catch(err => {
    res.status(500).json({err: err.message});
  });
}

export function deactivateQuestionJson(req, res) {
  Question.findById(req.body.id).then(question => {
    if (!question) {
      res.status(404).json({err: "Question not found"});
      return;
    }

    if (!quiz.activeQuestion || !question.equals(quiz.activeQuestion)) {
      res.status(404).json({err: "This isn't the active question"});
      return;
    }

    quiz.unsetQuestion();
    longPollers.broadcast(quiz.getState());
    presentationListeners.broadcast(quiz.getState());

    adminStateJson(req, res);
  }).catch(err => {
    res.status(500).json({err: err.message});
  });
}

export function showLeaderboardJson(req, res) {
  User.find({
    appearOnLeaderboard: true
  }).limit(10)
    .sort({ appearOnLeaderboard: 1, score: -1 }).then(users => {
      quiz.showLeaderboard();
      presentationListeners.broadcast({
        question: null,
        leaderboard: users.map(user => {
          return {
            name: user.name,
            avatarUrl: user.avatarUrl,
            score: user.score
          };
        })
      });
      adminStateJson(req, res);
    });
}

export function hideLeaderboardJson(req, res) {
  quiz.hideLeaderboard();
  presentationListeners.broadcast(
    Object.assign({leaderboard: null}, quiz.getState())
  );
  adminStateJson(req, res);
}

export function presentationListen(req, res) {
  presentationListeners.add(req, res);
}