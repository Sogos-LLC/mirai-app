const fs = require('fs').promises;
const path = require('path');

async function rebuildLibrary() {
  const dataDir = path.join(process.cwd(), 'data');
  const coursesDir = path.join(dataDir, 'courses');
  const libraryFile = path.join(dataDir, 'library.json');

  try {
    // Read existing library
    const libraryContent = await fs.readFile(libraryFile, 'utf-8');
    const library = JSON.parse(libraryContent);

    // Read all course files
    const courseFiles = await fs.readdir(coursesDir);
    const courses = [];

    for (const file of courseFiles) {
      if (file.endsWith('.json')) {
        const coursePath = path.join(coursesDir, file);
        const courseContent = await fs.readFile(coursePath, 'utf-8');
        const course = JSON.parse(courseContent);

        courses.push({
          id: course.id,
          title: course.settings?.title || 'Untitled Course',
          status: course.status || 'draft',
          folder: course.settings?.destinationFolder || '',
          tags: course.settings?.categoryTags || [],
          createdAt: course.metadata?.createdAt || new Date().toISOString(),
          modifiedAt: course.metadata?.modifiedAt || new Date().toISOString()
        });
      }
    }

    // Update library
    library.courses = courses;
    library.lastUpdated = new Date().toISOString();

    // Write back
    await fs.writeFile(libraryFile, JSON.stringify(library, null, 2));
    console.log(`Library rebuilt with ${courses.length} courses`);
  } catch (error) {
    console.error('Error rebuilding library:', error);
  }
}

rebuildLibrary();