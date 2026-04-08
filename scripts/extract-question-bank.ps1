param(
  [string]$SourcePath,
  [string]$OutputPath = "data/question-bank.js"
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.IO.Compression.FileSystem

$ChapterPrefix = [string][char]0x7B2C
$ChapterMarker = [string][char]0x7AE0
$AnswerWord = ([string][char]0x7B54) + ([string][char]0x6848)
$FullWidthColon = [string][char]0xFF1A

function Get-DefaultSourcePath {
  $docxFile = Get-ChildItem -LiteralPath (Get-Location) -Filter *.docx | Select-Object -First 1
  if (-not $docxFile) {
    throw "No DOCX question bank was found in the project root."
  }

  return $docxFile.FullName
}

function Get-DocumentXml {
  param([string]$DocxPath)

  $zip = [System.IO.Compression.ZipFile]::OpenRead($DocxPath)
  try {
    $entry = $zip.Entries | Where-Object { $_.FullName -eq 'word/document.xml' }
    if (-not $entry) {
      throw "The DOCX file does not contain word/document.xml."
    }

    $reader = New-Object System.IO.StreamReader($entry.Open())
    try {
      [xml]$reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
  }
  finally {
    $zip.Dispose()
  }
}

function Get-NodeText {
  param(
    [System.Xml.XmlNode]$Node,
    [System.Xml.XmlNamespaceManager]$NamespaceManager
  )

  return (($Node.SelectNodes('.//w:t', $NamespaceManager) | ForEach-Object { $_.'#text' }) -join '').Trim()
}

function Get-ChapterBreakIndex {
  param([string]$Text)

  if ([string]::IsNullOrWhiteSpace($Text)) {
    return -1
  }

  if (-not $Text.StartsWith($script:ChapterPrefix)) {
    return -1
  }

  return $Text.IndexOf($script:ChapterMarker)
}

function Is-ChapterHeader {
  param([string]$Text)

  $breakIndex = Get-ChapterBreakIndex -Text $Text
  return $breakIndex -ge 0 -and -not $Text.EndsWith($script:AnswerWord)
}

function Is-ChapterAnswerHeader {
  param([string]$Text)

  $breakIndex = Get-ChapterBreakIndex -Text $Text
  return $breakIndex -ge 0 -and $Text.EndsWith($script:AnswerWord)
}

function Get-ShortChapterName {
  param([string]$ChapterName)

  $breakIndex = $ChapterName.IndexOf($script:ChapterMarker)
  if ($breakIndex -lt 0) {
    return $ChapterName
  }

  return $ChapterName.Substring($breakIndex + 1)
}

function Get-UpdatedAt {
  param([string[]]$Paragraphs)

  if ($Paragraphs.Count -lt 2) {
    return ""
  }

  $line = $Paragraphs[1]
  $colonIndex = $line.IndexOf($script:FullWidthColon)
  if ($colonIndex -lt 0) {
    $colonIndex = $line.IndexOf(':')
  }

  if ($colonIndex -lt 0) {
    return $line
  }

  return $line.Substring($colonIndex + 1).Trim()
}

function New-ChapterId {
  param([int]$ChapterNumber)

  return ('chapter-{0:D2}' -f $ChapterNumber)
}

if (-not $SourcePath) {
  $SourcePath = Get-DefaultSourcePath
}

if (-not (Test-Path -LiteralPath $SourcePath)) {
  throw "Question bank file not found: $SourcePath"
}

$documentXml = Get-DocumentXml -DocxPath $SourcePath
$namespaceManager = New-Object System.Xml.XmlNamespaceManager($documentXml.NameTable)
$namespaceManager.AddNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main')

$paragraphs = foreach ($paragraphNode in $documentXml.SelectNodes('//w:body//w:p', $namespaceManager)) {
  $text = Get-NodeText -Node $paragraphNode -NamespaceManager $namespaceManager
  if ($text) {
    $text
  }
}

$answerSections = @{}
$currentAnswerChapter = $null
$body = $documentXml.SelectSingleNode('//w:body', $namespaceManager)

foreach ($child in $body.ChildNodes) {
  $text = Get-NodeText -Node $child -NamespaceManager $namespaceManager
  if (-not $text) {
    continue
  }

  if (Is-ChapterAnswerHeader -Text $text) {
    $currentAnswerChapter = $text.Substring(0, $text.Length - $AnswerWord.Length)
    continue
  }

  if ($currentAnswerChapter -and $child.LocalName -eq 'tbl') {
    $answerSections[$currentAnswerChapter] = ($text -replace '[^A-D]', '').ToCharArray()
    $currentAnswerChapter = $null
  }
}

$chapterHeaderIndexes = @()
for ($index = 0; $index -lt $paragraphs.Count; $index += 1) {
  if (Is-ChapterHeader -Text $paragraphs[$index]) {
    $chapterHeaderIndexes += $index
  }
}

$answerStartIndex = -1
for ($index = 0; $index -lt $paragraphs.Count; $index += 1) {
  if (Is-ChapterAnswerHeader -Text $paragraphs[$index]) {
    $answerStartIndex = $index
    break
  }
}

if ($answerStartIndex -lt 0) {
  throw "The answer section could not be found in the DOCX file."
}

$chapters = @()

for ($chapterIndex = 0; $chapterIndex -lt $chapterHeaderIndexes.Count; $chapterIndex += 1) {
  $headerIndex = $chapterHeaderIndexes[$chapterIndex]
  $chapterName = $paragraphs[$headerIndex]
  $chapterId = New-ChapterId -ChapterNumber ($chapterIndex + 1)
  $shortName = Get-ShortChapterName -ChapterName $chapterName
  $chapterEndIndex = if ($chapterIndex -lt $chapterHeaderIndexes.Count - 1) {
    $chapterHeaderIndexes[$chapterIndex + 1] - 1
  }
  else {
    $answerStartIndex - 1
  }

  $questions = @()
  $questionNumber = 0

  for ($paragraphIndex = $headerIndex + 1; $paragraphIndex -le $chapterEndIndex; ) {
    $questionText = $paragraphs[$paragraphIndex]
    if ($questionText -match '^\([A-D]\)') {
      $paragraphIndex += 1
      continue
    }

    $options = @()
    $paragraphIndex += 1
    while ($paragraphIndex -le $chapterEndIndex -and $paragraphs[$paragraphIndex] -match '^\(([A-D])\)(.+)$') {
      $options += [ordered]@{
        key = $Matches[1]
        text = $Matches[2].Trim()
      }
      $paragraphIndex += 1
    }

    if ($options.Count -ne 4) {
      throw "Question parsing failed because one item does not have exactly four options."
    }

    $questionNumber += 1
    $questions += [ordered]@{
      id = ('{0}-{1:D3}' -f $chapterId, $questionNumber)
      chapterId = $chapterId
      chapterName = $chapterName
      question = $questionText
      answer = ""
      options = $options
    }
  }

  $answers = $answerSections[$chapterName]
  if (-not $answers) {
    throw "An answer table is missing for one chapter."
  }

  if ($answers.Count -ne $questions.Count) {
    throw "The number of answers does not match the number of questions in one chapter."
  }

  for ($answerIndex = 0; $answerIndex -lt $questions.Count; $answerIndex += 1) {
    $questions[$answerIndex].answer = [string]$answers[$answerIndex]
  }

  $chapters += [ordered]@{
    id = $chapterId
    name = $chapterName
    shortName = $shortName
    questions = $questions
  }
}

$questionBank = [ordered]@{
  title = if ($paragraphs.Count -gt 0) { $paragraphs[0] } else { 'Question Bank' }
  meta = [ordered]@{
    sourceFile = [System.IO.Path]::GetFileName($SourcePath)
    updatedAt = Get-UpdatedAt -Paragraphs $paragraphs
    totalQuestions = ($chapters | ForEach-Object { $_.questions.Count } | Measure-Object -Sum).Sum
    extractedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  }
  chapters = $chapters
}

$outputDirectory = Split-Path -Parent $OutputPath
if ($outputDirectory -and -not (Test-Path -LiteralPath $outputDirectory)) {
  New-Item -ItemType Directory -Path $outputDirectory | Out-Null
}

$json = $questionBank | ConvertTo-Json -Depth 8 -Compress
$scriptContent = "window.QUESTION_BANK = $json;"
Set-Content -LiteralPath $OutputPath -Value $scriptContent -Encoding UTF8

Write-Output ('Question bank generated at {0} with {1} questions.' -f $OutputPath, $questionBank.meta.totalQuestions)
