"use client";
import { Component, type ReactNode } from "react";
export class StudyBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <section className="study-panel" role="alert">
        <h2>이 학습 화면을 표시하지 못했습니다.</h2>
        <p>저장된 자료·문제집은 유지됩니다. 화면을 다시 열어 확인하세요.</p>
        <button onClick={() => this.setState({ failed: false })}>
          화면 다시 열기
        </button>
      </section>
    ) : (
      this.props.children
    );
  }
}
