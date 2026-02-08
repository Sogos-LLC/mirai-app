'use client';

import { useState } from 'react';
import { GraduationCap, BookOpen, Pencil, Check } from 'lucide-react';
import { create } from '@bufbuild/protobuf';
import type { WizardContext, WizardEvent } from '@/machines/wizardMachine';
import type { SMEPersona, AudiencePersona } from '@/gen/mirai/v1/course_wizard_pb';
import { SMEPersonaSchema, AudiencePersonaSchema } from '@/gen/mirai/v1/course_wizard_pb';

interface WizardStep3TeacherStudentProps {
  context: WizardContext;
  send: (event: WizardEvent) => void;
}

export function WizardStep3TeacherStudent({ context, send }: WizardStep3TeacherStudentProps) {
  const [editingTeacher, setEditingTeacher] = useState(false);
  const [editingStudent, setEditingStudent] = useState(false);

  // Local edit state for teacher
  const [teacherTitle, setTeacherTitle] = useState(context.teacher?.jobTitle ?? '');
  const [teacherDesc, setTeacherDesc] = useState(context.teacher?.description ?? '');
  const [teacherVoice, setTeacherVoice] = useState(context.teacher?.voice ?? '');

  // Local edit state for student
  const [studentName, setStudentName] = useState(context.student?.name ?? '');
  const [studentRole, setStudentRole] = useState(context.student?.role ?? '');
  const [studentGoals, setStudentGoals] = useState(context.student?.goals?.join(', ') ?? '');

  const saveTeacher = () => {
    const updated = create(SMEPersonaSchema, {
      id: context.teacher?.id ?? 'teacher-1',
      jobTitle: teacherTitle,
      description: teacherDesc,
      voice: teacherVoice,
      skills: context.teacher?.skills ?? [],
    });
    send({ type: 'SET_TEACHER', teacher: updated });
    setEditingTeacher(false);
  };

  const saveStudent = () => {
    const updated = create(AudiencePersonaSchema, {
      id: context.student?.id ?? 'student-1',
      name: studentName,
      role: studentRole,
      description: context.student?.description ?? '',
      goals: studentGoals.split(',').map((g) => g.trim()).filter(Boolean),
    });
    send({ type: 'SET_STUDENT', student: updated });
    setEditingStudent(false);
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-xl font-semibold text-primary mb-2">
          Meet Your Teacher & Student
        </h2>
        <p className="text-sm text-secondary max-w-lg mx-auto">
          AI has created expert profiles based on your topic. You can edit them to match your needs.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Teacher card */}
        <div className="border rounded-xl p-5 bg-surface">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400 uppercase tracking-wide">
                  Teacher
                </span>
              </div>
            </div>
            <button
              onClick={() => editingTeacher ? saveTeacher() : setEditingTeacher(true)}
              className="p-2 text-muted hover:text-primary rounded-lg hover:bg-hover transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
              title={editingTeacher ? 'Save' : 'Edit'}
            >
              {editingTeacher ? <Check className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
            </button>
          </div>

          {editingTeacher ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Title / Role</label>
                <input
                  value={teacherTitle}
                  onChange={(e) => setTeacherTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-page border rounded-lg text-sm text-primary focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Expertise</label>
                <textarea
                  value={teacherDesc}
                  onChange={(e) => setTeacherDesc(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-page border rounded-lg text-sm text-primary focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Teaching Voice</label>
                <input
                  value={teacherVoice}
                  onChange={(e) => setTeacherVoice(e.target.value)}
                  className="w-full px-3 py-2 bg-page border rounded-lg text-sm text-primary focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <h3 className="font-semibold text-primary">{context.teacher?.jobTitle ?? 'Expert'}</h3>
              <p className="text-sm text-secondary">{context.teacher?.description ?? 'AI-generated expert profile'}</p>
              {context.teacher?.voice && (
                <p className="text-xs text-muted italic">&ldquo;{context.teacher.voice}&rdquo;</p>
              )}
            </div>
          )}
        </div>

        {/* Student card */}
        <div className="border rounded-xl p-5 bg-surface">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <span className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                  Student
                </span>
              </div>
            </div>
            <button
              onClick={() => editingStudent ? saveStudent() : setEditingStudent(true)}
              className="p-2 text-muted hover:text-primary rounded-lg hover:bg-hover transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
              title={editingStudent ? 'Save' : 'Edit'}
            >
              {editingStudent ? <Check className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
            </button>
          </div>

          {editingStudent ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Name / Title</label>
                <input
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  className="w-full px-3 py-2 bg-page border rounded-lg text-sm text-primary focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Role</label>
                <input
                  value={studentRole}
                  onChange={(e) => setStudentRole(e.target.value)}
                  className="w-full px-3 py-2 bg-page border rounded-lg text-sm text-primary focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Learning Goals (comma-separated)</label>
                <textarea
                  value={studentGoals}
                  onChange={(e) => setStudentGoals(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-page border rounded-lg text-sm text-primary focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <h3 className="font-semibold text-primary">{context.student?.name ?? 'Learner'}</h3>
              <p className="text-sm text-secondary">{context.student?.role ?? 'Target learner'}</p>
              {context.student?.goals && context.student.goals.length > 0 && (
                <ul className="text-xs text-muted space-y-1">
                  {context.student.goals.map((goal, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-emerald-500 mt-0.5">&#x2022;</span>
                      {goal}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
